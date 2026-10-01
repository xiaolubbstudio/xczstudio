param([switch]$CheckOnly, [switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
$script:StudioEndpoint = 'https://xczstudio-openlist-trial.eliya-activation-cloud.workers.dev'
$script:StudioCredentialFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.cloud-backend\private\credentials.dpapi'

function Convert-StudioSecretToText([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Read-StudioCredentials {
    if (-not (Test-Path -LiteralPath $script:StudioCredentialFile)) { throw '找不到本机加密账号记录，请在原电脑、原 Windows 用户下运行。' }
    try {
        $secret = (Get-Content -Raw -LiteralPath $script:StudioCredentialFile).Trim() | ConvertTo-SecureString
        $credentials = (Convert-StudioSecretToText $secret) | ConvertFrom-Json
        if ($credentials.endpoint.TrimEnd('/') -ne $script:StudioEndpoint) { throw '地址不匹配' }
        return $credentials
    } catch { throw '无法解密本地记录，或后台地址不匹配。请使用保存记录的 Windows 用户运行。' }
}
function Save-StudioCredentials($Credentials) {
    $encrypted = ConvertTo-SecureString ($Credentials | ConvertTo-Json -Depth 12 -Compress) -AsPlainText -Force | ConvertFrom-SecureString
    $temporary = $script:StudioCredentialFile + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($temporary, $encrypted, [Text.Encoding]::ASCII)
        if (Test-Path -LiteralPath $script:StudioCredentialFile) { [IO.File]::Replace($temporary, $script:StudioCredentialFile, ($temporary + '.previous'), $true) }
        else { [IO.File]::Move($temporary, $script:StudioCredentialFile) }
    } finally {
        foreach ($file in @($temporary, ($temporary + '.previous'))) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
    }
}
function Invoke-StudioApi([string]$Route, [string]$Method = 'GET', $Body = $null, [string]$Token = '') {
    if ($Route -notmatch '^/api/(auth/(login|logout)|me|admin/user/(list|get|update))(\?id=\d+)?$') { throw '不允许的后台操作。' }
    $headers = @{}
    if ($Token) { $headers.Authorization = $Token }
    $request = @{ Uri = $script:StudioEndpoint + $Route; Method = $Method; Headers = $headers; TimeoutSec = 30; MaximumRedirection = 0; ErrorAction = 'Stop' }
    if ($null -ne $Body) { $request.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)); $request.ContentType = 'application/json; charset=utf-8' }
    try { $result = Invoke-RestMethod @request }
    catch { throw '后台请求未完成，请检查网络。修改提交后若中断，请先刷新成员列表，不要反复提交。' }
    if ($result.code -ne 200) { throw ('后台拒绝操作（代码 ' + $result.code + '）。请刷新列表，确认管理员授权与用户名是否重复。') }
    return $result.data
}
function Get-StudioMembers([string]$Token) {
    $data = Invoke-StudioApi '/api/admin/user/list' 'GET' $null $Token
    return @($data.content | Where-Object { $_.role -eq 0 } | Sort-Object id)
}
function Submit-StudioMemberChange($Credentials, $Member, [string]$Username, [string]$Password, [string]$Token) {
    $Username = $Username.Trim()
    if (-not $Username -or $Username.Length -gt 64 -or $Username -match '\s|[\x00-\x1F\x7F]') { throw '用户名须为 1–64 个字符，不包含空格或控制字符。' }
    if ($Password -and ($Password.Length -lt 8 -or $Password.Length -gt 128 -or $Password -ne $Password.Trim())) { throw '密码须为 8–128 个字符，开头和结尾不能是空格。' }
    $fresh = Get-StudioMembers $Token
    $current = $fresh | Where-Object { $_.id -eq $Member.id } | Select-Object -First 1
    if (-not $current -or $current.username -ne $Member.username) { throw '成员已被其他管理员修改，请刷新列表后重试。' }
    if (@($fresh | Where-Object { $_.id -ne $Member.id -and $_.username -eq $Username }).Count) { throw '用户名已被其他成员使用。' }
    # Do not send roles, permission bits, base paths, administrator credentials, or disabled flags.
    $body = @{ id = $Member.id; username = $Username }
    if ($Password) { $body.password = $Password }
    Invoke-StudioApi '/api/admin/user/update' 'POST' $body $Token | Out-Null
    $confirmed = Invoke-StudioApi ('/api/admin/user/get?id=' + $Member.id) 'GET' $null $Token
    if ($confirmed.username -ne $Username -or $confirmed.role -ne $current.role -or $confirmed.permission -ne $current.permission -or $confirmed.base_path -ne $current.base_path -or $confirmed.disabled -ne $current.disabled) { throw '后台已接收修改，但回读验证未通过。请刷新列表或在后台核对，不要重复提交。' }
    $record = @($Credentials.members | Where-Object { ($_.PSObject.Properties['id'] -and $_.id -eq $Member.id) -or $_.username -eq $Member.username }) | Select-Object -First 1
    if ($record) {
        $record.username = $Username
        $record | Add-Member -NotePropertyName id -NotePropertyValue $Member.id -Force
        if ($Password) { $record.password = $Password }
    } else {
        $Credentials.members = @($Credentials.members) + [PSCustomObject]@{ id = $Member.id; username = $Username; password = $Password }
    }
    try { Save-StudioCredentials $Credentials }
    catch { Write-Warning '云端修改已经生效，但本机加密备份未保存成功。请记住刚才填写的新账号信息。' }
    return $confirmed
}
function Start-StudioMemberManager {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $credentials = $null; $token = ''; $newPassword = ''
    try {
        $credentials = Read-StudioCredentials
        $login = Invoke-StudioApi '/api/auth/login' 'POST' $credentials.admin
        $token = $login.token
        $profile = Invoke-StudioApi '/api/me' 'GET' $null $token
        if ($profile.role -ne 2) { throw '本地账号不是管理员，停止操作。' }
        if ($CheckOnly) {
            $members = Get-StudioMembers $token
            Write-Host ('连接检查通过：独立素材库后台，' + $members.Count + ' 个成员。未修改任何账号。')
            return
        }
        while ($true) {
            Write-Host "`n正经素材库 · 成员账号管理" -ForegroundColor Cyan
            $members = Get-StudioMembers $token
            for ($i = 0; $i -lt $members.Count; $i++) {
                $status = if ($members[$i].disabled) { '已停用' } else { '正常' }
                Write-Host ('  {0}. {1}  [{2}]' -f ($i + 1), $members[$i].username, $status)
            }
            Write-Host '  R. 刷新列表   Q. 退出'
            $choice = Read-Host '选择要修改的成员编号'
            if ($choice -eq 'Q') { break }
            if ($choice -eq 'R') { continue }
            $number = 0
            if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $members.Count) { Write-Host '请输入列表中的编号。'; continue }
            $member = $members[$number - 1]
            $newUsername = Read-Host ('新用户名（回车保留 ' + $member.username + '）')
            if (-not $newUsername.Trim()) { $newUsername = $member.username }
            $secret = Read-Host '新密码（输入隐藏；回车保留原密码）' -AsSecureString
            $newPassword = Convert-StudioSecretToText $secret
            if ($newPassword) {
                $repeat = Read-Host '再次输入新密码' -AsSecureString
                if ($newPassword -cne (Convert-StudioSecretToText $repeat)) { Write-Host '两次密码不一致，本次未提交。' -ForegroundColor Yellow; $newPassword = ''; continue }
            }
            if ($newUsername.Trim() -eq $member.username -and -not $newPassword) { Write-Host '没有修改。'; continue }
            $passwordStatus = if ($newPassword) { '更新' } else { '保持不变' }
            Write-Host ('提交：{0} → {1}；密码：{2}。' -f $member.username, $newUsername.Trim(), $passwordStatus)
            if ((Read-Host '输入 Y 提交到网站后台；其他输入取消') -ne 'Y') { $newPassword = ''; continue }
            try {
                $updated = Submit-StudioMemberChange $credentials $member $newUsername $newPassword $token
                Write-Host ('已生效：' + $updated.username + '。请用新账号信息登录网站。') -ForegroundColor Green
                if ($newPassword) { Write-Host '新的登录使用新密码；已有登录状态不会被本程序强制退出，请成员退出后重新登录。' }
            } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
            finally { $newPassword = ''; $secret = $null; $repeat = $null }
        }
    } catch { Write-Host $_.Exception.Message -ForegroundColor Red; return $false }
    finally {
        if ($token) { try { Invoke-StudioApi '/api/auth/logout' 'GET' $null $token | Out-Null } catch {} }
        $credentials = $null; $token = ''; $newPassword = ''
    }
    return $true
}
if (-not $LibraryOnly) {
    $result = Start-StudioMemberManager
    if ($result -eq $false) { exit 1 }
}


