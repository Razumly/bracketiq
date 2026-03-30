import SwiftUI
import ComposeApp
import FirebaseCore
import FirebaseMessaging
import GoogleMaps
import GoogleSignIn
import IQKeyboardManagerSwift
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    private static let appForegroundKey = "mvp_app_is_foreground"
    private static let fcmTokenDefaultsKey = "mvp_ios_fcm_token"
    private let apiKey: String = {
        guard let filePath = Bundle.main.path(forResource: "Secrets", ofType: "plist") else {
            fatalError("Couldn't find file 'Secrets.plist'.")
        }
        let plist = NSDictionary(contentsOfFile: filePath)
        guard let value = plist?.object(forKey: "googleMapsApiKey") as? String else {
            fatalError("Couldn't find key 'googleMapsApiKey' in 'Secrets.plist'.")
        }
        return value
    }()
    
    static var pendingDeepLink: URL?
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        
        FirebaseApp.configure()
        GMSServices.provideAPIKey(apiKey)
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        
        // Compose handles its own input/viewport behavior. Keep IQKeyboardManager disabled
        // so the root app view is not shifted when the keyboard appears.
        IQKeyboardManager.shared.isEnabled = false

        NotifierManager.shared.initialize(configuration: NotificationPlatformConfigurationIos(
            showPushNotification: false,
            askNotificationPermissionOnStart: false,
            notificationSoundName: nil
        ))
        evaluateNotificationAuthorization(application: application)
        
        UserDefaults.standard.set(true, forKey: AppDelegate.appForegroundKey)

        // Handle deep link when app is launched from scratch
        if let url = launchOptions?[.url] as? URL {
            AppDelegate.pendingDeepLink = url
        }
        
        return true
    }
    
    func application(_ application: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }

        AppDelegate.pendingDeepLink = url
        
        NotificationCenter.default.post(name: .deepLinkReceived, object: url)
        return true
    }
    
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            AppDelegate.pendingDeepLink = url
            NotificationCenter.default.post(name: .deepLinkReceived, object: url)
            return true
        }
        return false
    }
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error {
                print("Failed to fetch FCM token after APNs registration: \(error.localizedDescription)")
                return
            }
            self.persistFcmToken(token)
        }
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
        persistFcmToken(nil)
    }
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        persistFcmToken(fcmToken)
    }
    
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Foreground rendering is handled in shared code to suppress active-chat duplicates.
        completionHandler([])
    }
    
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        UserDefaults.standard.set(true, forKey: AppDelegate.appForegroundKey)
        evaluateNotificationAuthorization(application: application)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        UserDefaults.standard.set(false, forKey: AppDelegate.appForegroundKey)
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        UserDefaults.standard.set(false, forKey: AppDelegate.appForegroundKey)
    }
    
    private func persistFcmToken(_ token: String?) {
        let normalized = token?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let normalized, !normalized.isEmpty {
            UserDefaults.standard.set(normalized, forKey: AppDelegate.fcmTokenDefaultsKey)
            return
        }
        UserDefaults.standard.removeObject(forKey: AppDelegate.fcmTokenDefaultsKey)
    }

    private func evaluateNotificationAuthorization(application: UIApplication) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                    if let error {
                        print("Notification authorization request failed: \(error.localizedDescription)")
                    } else {
                        print("Notification authorization prompt result: granted=\(granted)")
                    }
                    DispatchQueue.main.async {
                        application.registerForRemoteNotifications()
                    }
                }
            case .authorized, .provisional, .ephemeral:
                print("Notification authorization already granted: \(self.authorizationStatusName(settings.authorizationStatus))")
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            case .denied:
                print("Notification authorization denied. Prompt will not reappear until user enables it in Settings.")
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            @unknown default:
                print("Notification authorization status unknown: \(settings.authorizationStatus.rawValue)")
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
    }

    private func authorizationStatusName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .authorized:
            return "authorized"
        case .provisional:
            return "provisional"
        case .ephemeral:
            return "ephemeral"
        @unknown default:
            return "unknown"
        }
    }
}

extension Notification.Name {
    static let deepLinkReceived = Notification.Name("deepLinkReceived")
}

@main
struct iOSApp: App {
    @State private var deepLinkUrl: URL?
    @State private var deepLinkId: String = "initial"
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    init() {
        MvpAppKt.doInitKoin()
    }
    
    var body: some Scene {
        WindowGroup {
            ComposeView(deepLinkUrl: deepLinkUrl)
                .ignoresSafeArea()
                .id(deepLinkId) // Use the ID instead of URL string
                .onAppear {
                    if let pendingUrl = AppDelegate.pendingDeepLink {
                        updateDeepLink(pendingUrl)
                        AppDelegate.pendingDeepLink = nil
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .deepLinkReceived)) { notification in
                    if let url = notification.object as? URL {
                        updateDeepLink(url)
                    }
                }
                .onOpenURL { url in
                    if GIDSignIn.sharedInstance.handle(url) {
                        return
                    }
                    updateDeepLink(url)
                }
        }
    }
    
    private func updateDeepLink(_ url: URL) {
        deepLinkUrl = url
        deepLinkId = UUID().uuidString
        print("Deep link updated: \(url.absoluteString) with ID: \(deepLinkId)")
    }
}
