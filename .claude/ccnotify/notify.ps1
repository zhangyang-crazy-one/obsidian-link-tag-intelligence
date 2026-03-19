#Requires -Module BurntToast
# CCNotify - Windows Toast Notification Script
# Simplified design style

param(
    [Parameter(Mandatory=$true)]
    [string]$TitleB64,
    
    [Parameter(Mandatory=$true)]
    [string]$MessageB64,
    
    [string]$Cwd = "",
    
    [ValidateSet("TaskComplete", "WaitingInput", "Permission", "Notification")]
    [string]$NotificationType = "Notification"
)

# Decode Base64 parameters
$Title = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TitleB64))
$Message = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($MessageB64))

# Use brain icon for all notifications (simplified design)
$IconPath = Join-Path $PSScriptRoot "icons\brain.png"
if (-not (Test-Path $IconPath)) {
    $IconPath = Join-Path $PSScriptRoot "icons\default.png"
}

# Build notification content - simplified design
# Fixed header "CCNotify", dynamic content
$TextElements = @(
    New-BTText -Text "CCNotify"
    New-BTText -Text $Title
    New-BTText -Text $Message
)

# Add app logo if exists
$AppLogo = $null
if (Test-Path $IconPath) {
    $AppLogo = New-BTImage -Source $IconPath -AppLogoOverride -Crop Circle
}

# Build buttons
$Buttons = @()

# Open Project button with folder emoji
if ($Cwd -and $Cwd -ne "") {
    $VsCodePath = $Cwd.Replace('\', '/')
    $FolderEmoji = [char]::ConvertFromUtf32(0x1F4C2)  # Folder emoji
    $OpenButtonText = "$FolderEmoji Open Project"
    $OpenButton = New-BTButton -Content $OpenButtonText -Arguments "vscode://file/$VsCodePath" -ActivationType Protocol
    $Buttons += $OpenButton
}

# Dismiss button with check emoji
$CheckEmoji = [char]::ConvertFromUtf32(0x2714)  # Check emoji
$DismissButtonText = "$CheckEmoji Dismiss"
$DismissButton = New-BTButton -Dismiss -Content $DismissButtonText
$Buttons += $DismissButton

# Build actions
$Actions = New-BTAction -Buttons $Buttons

# Sound based on notification type
$SoundType = switch ($NotificationType) {
    "TaskComplete"   { "Default" }
    "WaitingInput"   { "Reminder" }
    "Permission"     { "Alarm2" }
    default          { "Default" }
}

# Build Binding
$BindingParams = @{
    Children = $TextElements
}
if ($AppLogo) {
    $BindingParams.AppLogoOverride = $AppLogo
}
$Binding = New-BTBinding @BindingParams

# Build Visual
$Visual = New-BTVisual -BindingGeneric $Binding

# Build Audio
$Audio = New-BTAudio -Source "ms-winsoundevent:Notification.$SoundType"

# Build Toast Content
$Content = New-BTContent -Visual $Visual -Actions $Actions -Audio $Audio

# Send notification
Submit-BTNotification -Content $Content
