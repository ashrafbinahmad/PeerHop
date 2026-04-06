# PeerHop Version Plan

## v2.5.9
* Native resizable window with rounded corners and border styling (Windows/Linux)
* Prioritized network connection UI (Hotspot and Wi-Fi first, other interfaces hidden behind toggle)
* Added QR code viewing capability for local hotspot networks
* Enhanced platform icons for Windows and Linux with more professional visuals
* Fixed Linux network detection logic using nmcli and iwgetid
* Fixed "Open in Folder" logic to respect the currently selected download path
* Fixed QR code component cropping issue when multiple networks are available
* Improved UI transitions and glassmorphism effects for a more premium feel

## v2.5.8
* Native system notifications for multi-client downloads (files >= 5 MB) when app is not focused
* Refined network selection and connection interface with accent-colored active states
* Robust network fallback and connection address tooltip on QR code
* Added Windows Mobile Hotspot integration (auto-enable and display hotspot name)
* Modernized QR connection interface with platform-specific onboarding (Windows, Linux, macOS)
* Persistent connection method state (QR vs. Link) across tab switches
* Improved Feature Request form UX (compact design and theme-consistent colors)
* High-visibility dashed underlines for editable fields and standard arrow cursors for disabled elements
* Instant application of download path changes for new transactions
* Added settings for custom file saving location with reliable persistence
* Conditioned QR code size based on security status (smaller if security is disabled)
* Restart server confirmation dialog when active connections exist
* Disabled (instead of hidden) custom port edit button during server restart
* Added device name length validation and improved error handling
* Standardized panel backgrounds and removed unnecessary UI shadows for a cleaner design
* Clarified mobile transfer labels ("sent" and "received") for better intuition
* Fixed TypeScript translation errors and layout shifts in QR panel

## v2.5.7
* Fixed show in folder not working
* Made the desktop width more adaptive, fixed open file location
* Made recieving transaction better ui
* Added delete transaction
* Add ConfirmDialog component and integrate transaction deletion flow in ChatPanel
* Removed - 0.5 px from desktop app width
* Added static port feature
* Fixed client list view and client blocking setup
* Added authentication failed screen
* Made client list better
* Made qr panel better, made always multi client
* Added deviceName to log
* Added email logging also
* Made scrolling and chat view perfect
* Fixed minor issues
* Showing terminal when clicking rate peerhop
* Make the default width larger
* Remove auto downloading
* Make minimize icon different

## v2.5.1
* Should show download progress in desktop also when downloading to phone - Fixed
* Upload from phone works perfectly
* Showing 0 mbps when downloading in phone, either remove speed, or fix it - Fixed
* Even when it is cancelled and then download in mobile it should show progress - Fixed
* Some times ws seems to be stopped that I had to reload mobile to reconnect, add a button to reload when ws disconnected, or auto reload, seems to be when iPhone is locked ws disconnects
* When restart server or unrender, previous server should be killed
* Scroll issue in both - Fixed
* In multi client the second device shows as download completed for the file uploaded from another mobile - Fixed
* When cancelling download for one device the other device is also stopped downloading, seems like have to create download links for each device differently - Fixed
* Make the percentage in desktop more visible
* Showing IOS in android device in multi client connection
* Made filename smaller
* Added multiple languages, language sent to activity
* Fixed showing white of iframe if loading failed
* Add peerhop in windows share list
* Updated ChatPanel to conditionally render the send text button based on text transfer capability
* Enhanced DesktopView with review action tracking and review prompt triggering
* Refactored SettingsPanel to include new actions for requesting features and rating the app
* Improved error handling and user notifications across various components
* Updated styles and layout for better user experience
* feat: add referral feedback modal and integrate review tracking

## v2.4.5
* At first, it shows no wifi detected, when restart server it connects
* Make heading "Connect device to start sharing files"
* When change theme, it empties activities (when change theme it is sending stopped)
* After sent stopped when sending another acitivity it clears older activities
* Sending text not sending activity, send activity like Sent ## characters text
* Make logo non draggable

## Pending Features & Bugs
* In production there is red behind the icon in taskbar only
* Make the iframe the whole page, and add notifications
* Add peerhop to file menu, Share with peerhop
* Try force open in real browser
* add option for custom color theme and accent color