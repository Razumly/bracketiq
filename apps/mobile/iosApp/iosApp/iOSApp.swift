import SwiftUI
import ComposeApp
import FirebaseCore
import FirebaseMessaging
import GoogleMaps

class AppDelegate: NSObject, UIApplicationDelegate {
    private let apiKey: String  = {
        guard let filePath = Bundle.main.path(forResource: "Secrets", ofType: "plist") else {
          fatalError("Couldn't find file 'Secrets.plist'.")
        }
        let plist = NSDictionary(contentsOfFile: filePath)
        guard let value = plist?.object(forKey: "googleMapsApiKey") as? String else {
          fatalError("Couldn't find key 'googleMapsApiKey' in 'Secrets.plist'.")
        }
        return value
    }()

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
      FirebaseApp.configure()
      
      GMSServices.provideAPIKey(apiKey)
      
      NotifierManager.shared.initialize(configuration: NotificationPlatformConfigurationIos(
            showPushNotification: true,
            askNotificationPermissionOnStart: true,
            notificationSoundName: nil
          )
      )
      
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
  }
    
}

@main
struct iOSApp: App {
    @State private var didLoadKeys = false
    @State private var loadError: Error?
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    init() {
        MvpAppKt.doInitKoin()
    }
    
    var body: some Scene {
        WindowGroup {
            ComposeView()
            .onOpenURL { url in
                SharedWebAuthComponent.companion.handleIncomingCookie(url: url.absoluteString)
            }
        }
    }
}

