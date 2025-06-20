import SwiftUI
import ComposeApp
import FirebaseCore
import FirebaseMessaging
import GoogleMaps

class AppDelegate: NSObject, UIApplicationDelegate {
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
        
        NotifierManager.shared.initialize(configuration: NotificationPlatformConfigurationIos(
            showPushNotification: true,
            askNotificationPermissionOnStart: false,
            notificationSoundName: nil
        ))
        
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
        
        // Handle deep link when app is launched from scratch
        if let url = launchOptions?[.url] as? URL {
            AppDelegate.pendingDeepLink = url
        }
        
        return true
    }
    
    func application(_ application: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
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
                    updateDeepLink(url)
                    SharedWebAuthComponent.companion.handleIncomingCookie(url: url.absoluteString)
                }
        }
    }
    
    private func updateDeepLink(_ url: URL) {
        deepLinkUrl = url
        deepLinkId = UUID().uuidString
        print("Deep link updated: \(url.absoluteString) with ID: \(deepLinkId)")
    }
}




