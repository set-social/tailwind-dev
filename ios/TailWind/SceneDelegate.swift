import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// Xcode 27 / iOS 27 SDK hard-requires UIScene lifecycle adoption — apps that
// still create their window from AppDelegate.didFinishLaunchingWithOptions
// crash at launch (EXC_BREAKPOINT in
// UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). This mirrors
// the fix landing in the RN 0.88 community template (this project is on
// 0.86.3, which doesn't ship it yet): window creation + startReactNative move
// here, into scene(_:willConnectTo:), wired up via UIApplicationSceneManifest
// in Info.plist and AppDelegate.configurationForConnecting.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    let appDelegate = UIApplication.shared.delegate as? AppDelegate
    let rnDelegate = appDelegate?.reactNativeDelegate ?? ReactNativeDelegate()
    rnDelegate.dependencyProvider = RCTAppDependencyProvider()
    let factory = appDelegate?.reactNativeFactory ?? RCTReactNativeFactory(delegate: rnDelegate)

    reactNativeDelegate = rnDelegate
    reactNativeFactory = factory
    appDelegate?.reactNativeDelegate = rnDelegate
    appDelegate?.reactNativeFactory = factory

    let window = UIWindow(windowScene: windowScene)
    factory.startReactNative(
      withModuleName: "TailWind",
      in: window,
      launchOptions: appDelegate?.launchOptions
    )
    self.window = window
    appDelegate?.window = window
  }
}
