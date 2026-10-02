$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'manage-members.ps1') -LibraryOnly
function Assert-Studio($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-StudioThrows([scriptblock]$Action) { $caught = $false; try { & $Action | Out-Null } catch { $caught = $true }; Assert-Studio $caught 'Expected operation to be rejected' }
$script:testMembers = @(
    [PSCustomObject]@{ id=11; username='test-one'; role=0; permission=8; base_path='/素材'; disabled=$false },
    [PSCustomObject]@{ id=12; username='test-two'; role=0; permission=8; base_path='/素材'; disabled=$false }
)
$script:testRequests = @(); $script:testSaved = $false
function Invoke-StudioApi([string]$Route, [string]$Method = 'GET', $Body = $null, [string]$Token = '') {
    Assert-Studio ($Token -eq 'test-admin-session') 'Admin session was not passed'
    if ($Route -eq '/api/admin/user/list') { return [PSCustomObject]@{ content=$script:testMembers } }
    if ($Route -eq '/api/admin/user/update') {
        $script:testRequests += $Body.Clone()
        $record = $script:testMembers | Where-Object id -eq $Body.id
        $record.username = $Body.username
        if ($Body.ContainsKey('permission')) { $record.permission = $Body.permission }
        return $null
    }
    if ($Route -eq '/api/admin/user/get?id=11') { return $script:testMembers[0] }
    throw 'Unexpected operation'
}
$taskTestFile = Join-Path (Split-Path $PSScriptRoot -Parent) ('.cloud-backend\private\member-test-' + [Guid]::NewGuid().ToString('N') + '.dpapi')
$script:StudioCredentialFile = $taskTestFile
try {
    $credentials = [PSCustomObject]@{ endpoint=$script:StudioEndpoint; admin=[PSCustomObject]@{ username='test-admin'; password='fake-admin-pass' }; members=@([PSCustomObject]@{ username='test-one'; password='fake-old-pass' }) }
    $original = [PSCustomObject]@{ id=11; username='test-one' }
    Assert-StudioThrows { Submit-StudioMemberChange $credentials $original 'test-two' '' 'test-admin-session' }
    Assert-StudioThrows { Submit-StudioMemberChange $credentials $original 'valid-name' 'short' 'test-admin-session' }
    Assert-StudioThrows { Submit-StudioMemberChange $credentials $original 'two words' 'fake-new-pass' 'test-admin-session' }
    Assert-Studio ($script:testRequests.Count -eq 0) 'Invalid changes reached the backend'
    $updated = Submit-StudioMemberChange $credentials $original 'renamed-user' 'fake-new-pass' 'test-admin-session'
    Assert-Studio ($updated.username -eq 'renamed-user') 'Rename not applied'
    Assert-Studio (($script:testRequests[0].Keys | Sort-Object) -join ',' -eq 'id,password,username') 'Changed fields outside username/password'
    Assert-Studio ($script:testRequests[0].password -eq 'fake-new-pass') 'Password missing from submission'
    $encrypted = Get-Content -Raw -LiteralPath $taskTestFile
    Assert-Studio (-not $encrypted.Contains('fake-new-pass')) 'Password stored in plaintext'
    $backup = Read-StudioCredentials
    Assert-Studio ($backup.members[0].id -eq 11 -and $backup.members[0].username -eq 'renamed-user' -and $backup.members[0].password -eq 'fake-new-pass') 'Encrypted backup did not follow stable member ID'
    Assert-StudioThrows { Submit-StudioMemberChange $credentials $original 'another-name' '' 'test-admin-session' }
    Assert-Studio ($script:testRequests.Count -eq 1) 'Stale change submitted'
    $renamed = [PSCustomObject]@{ id=11; username='renamed-user' }
    Submit-StudioMemberChange $credentials $renamed 'renamed-again' '' 'test-admin-session' | Out-Null
    Assert-Studio (-not $script:testRequests[1].ContainsKey('password')) 'Blank password reset existing password'
    $backup = Read-StudioCredentials
    Assert-Studio ($backup.members[0].password -eq 'fake-new-pass' -and $backup.members[0].username -eq 'renamed-again') 'Second update failed to persist encrypted backup'
    # 只看：去掉写权限位；再改回可整理。没有切换时不发送权限。
    $again = [PSCustomObject]@{ id=11; username='renamed-again' }
    $viewer = Submit-StudioMemberChange $credentials $again 'renamed-again' '' 'test-admin-session' $true
    Assert-Studio ($script:testRequests[2].permission -eq 0 -and $viewer.permission -eq 0) 'Read-only did not clear write permission'
    Assert-Studio (Test-StudioReadOnly $viewer) 'Read-only member not detected'
    $editor = Submit-StudioMemberChange $credentials $again 'renamed-again' '' 'test-admin-session' $false
    Assert-Studio ($script:testRequests[3].permission -eq 248 -and -not (Test-StudioReadOnly $editor)) 'Editable permission not restored'
    Submit-StudioMemberChange $credentials $again 'renamed-again' '' 'test-admin-session' $false | Out-Null
    Assert-Studio (-not $script:testRequests[4].ContainsKey('permission')) 'Unchanged permission was resent'
    Write-Host '通过：重复用户名、非法输入、并发过期保护、最小修改字段、改名及改密、保留原密码、加密备份回读、只看与可整理切换。'
} finally { if (Test-Path -LiteralPath $taskTestFile) { Remove-Item -LiteralPath $taskTestFile } }

