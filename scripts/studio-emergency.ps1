param([ValidateSet('Menu','Status','Close','Open')][string]$Action='Menu')
$ErrorActionPreference='Stop'
$taskAccount='cc439d00213ab3c2cddc9285ef04a983'
$taskWorker='2ec2544d1e15477da752382d56aef6a1'
$taskHost='xczstudio-openlist-trial.eliya-activation-cloud.workers.dev'
$taskPolicyName='正经素材库-紧急关闭入口'
$taskToken=''
function Invoke-StudioCloudflare([string]$Route,[string]$Method='GET',$Body=$null) {
  if ($Route -notmatch '^/access/apps(?:/[a-f0-9-]+(?:/policies(?:/[a-f0-9-]+)?)?)?$') { throw '停止：请求超出素材库 Access 管理范围。' }
  $request=@{Uri=('https://api.cloudflare.com/client/v4/accounts/'+$taskAccount+$Route);Method=$Method;Headers=@{Authorization=('Bearer '+$taskToken)};TimeoutSec=30;MaximumRedirection=0;ErrorAction='Stop'}
  if ($null -ne $Body) { $request.Body=[Text.Encoding]::UTF8.GetBytes(($Body|ConvertTo-Json -Depth 12 -Compress));$request.ContentType='application/json; charset=utf-8' }
  try { $r=Invoke-RestMethod @request } catch { throw 'Cloudflare 请求失败。请检查网络及本机 Cloudflare 登录状态；程序不会修改其他 Worker。' }
  if (-not $r.success) { throw 'Cloudflare 拒绝操作。请在本机重新登录 Cloudflare，勿发送 token。' }
  return $r.result
}
try {
  $file=Join-Path $env:APPDATA 'xdg.config\.wrangler\config\default.toml'
  $config=Get-Content -Raw -LiteralPath $file
  $match=[regex]::Match($config,'oauth_token\s*=\s*"([^"]+)"')
  if (-not $match.Success) { throw '找不到本机 Cloudflare 登录授权，请先登录。' }
  $taskToken=$match.Groups[1].Value
  $apps=@(Invoke-StudioCloudflare '/access/apps')
  $safeApps=@($apps|Where-Object {
    $destinations=@($_.destinations)
    ($destinations.Count -eq 1 -and $destinations[0].type -eq 'worker' -and $destinations[0].worker_id -eq $taskWorker) -or
    (-not $_.destinations -and $_.domain -eq $taskHost)
  })
  if ($safeApps.Count -ne 1) { throw '素材库专用 Access 应用尚未配置，或检测到多个入口策略。当前不能通过此程序关站，请先完成邮箱入口配置。' }
  $app=$safeApps[0]
  $policies=@(Invoke-StudioCloudflare ('/access/apps/'+$app.id+'/policies'))
  $emergency=@($policies|Where-Object name -eq $taskPolicyName)
  if ($emergency.Count -gt 1) { throw '应急策略有重复，请在控制台核对。' }
  if ($emergency.Count -and ($emergency[0].decision -ne 'deny' -or -not $emergency[0].include[0].PSObject.Properties['everyone'])) { throw '同名策略不是本程序创建的拒绝规则，停止修改。' }
  $state=if ($emergency.Count) {'已关闭'} else {'正常开放给指定成员'}
  Write-Host ('素材库入口：'+$state) -ForegroundColor Cyan
  Write-Host '此程序只修改素材库 Access；插件验证服务保持不变。'
  if ($Action -eq 'Menu') {
    $selection=Read-Host '1 紧急关闭；2 恢复原有成员访问；其他输入退出'
    $Action=if ($selection -eq '1') {'Close'} elseif ($selection -eq '2') {'Open'} else {'Status'}
  }
  if ($Action -eq 'Close' -and -not $emergency.Count) {
    $body=@{name=$taskPolicyName;decision='deny';precedence=1;include=@(@{everyone=@{}});exclude=@();require=@()}
    Invoke-StudioCloudflare ('/access/apps/'+$app.id+'/policies') 'POST' $body|Out-Null
    $check=@(Invoke-StudioCloudflare ('/access/apps/'+$app.id+'/policies')|Where-Object name -eq $taskPolicyName)
    if (-not $check.Count) { throw '关闭提交后的回读未确认，请在控制台核对。' }
    Write-Host '应急拒绝策略已保存。现有成员也会被停止放行；边缘策略需要短暂传播。' -ForegroundColor Green
  } elseif ($Action -eq 'Open' -and $emergency.Count) {
    Invoke-StudioCloudflare ('/access/apps/'+$app.id+'/policies/'+$emergency[0].id) 'DELETE'|Out-Null
    Write-Host '已移除应急拒绝规则，只恢复原有邮箱名单；没有开放给所有人。' -ForegroundColor Green
  }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
finally { $taskToken='';$config=$null;$match=$null }
