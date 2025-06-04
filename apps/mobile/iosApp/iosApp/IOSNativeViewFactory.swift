//
//  iOSNativeViewFactory.swift
//  iosApp
//
//  Created by Elesey Razumovskiy on 6/3/25.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation
import ComposeApp
import UIKit
import SwiftUI

class IOSNativeViewFactory: NativeViewFactory {
    static var shared = IOSNativeViewFactory()
    
    func createNativeMapView(
        component: MapComponent,
        onEventSelected: @escaping (any EventAbs) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        canClickPOI: Bool,
        focusedLocation: LatLng?,
        focusedEvent: (any EventAbs)?,
        revealCenterX: Double,
        revealCenterY: Double
    ) -> UIViewController {
        
        let centerPoint = CGPoint(x: revealCenterX, y: revealCenterY)
        let view = EventMap(
            component: component,
            onEventSelected: onEventSelected,
            onPlaceSelected: onPlaceSelected,
            canClickPOI: canClickPOI,
            focusedLocation: focusedLocation,
            focusedEvent: focusedEvent,
            revealCenter: centerPoint
        )
        
        let hostingController = UIHostingController(rootView: view)
        
        // Make the hosting controller's view transparent
        hostingController.view.backgroundColor = UIColor.clear
        
        return hostingController
    }
    
    func updateNativeMapView(
            viewController: UIViewController,
            component: MapComponent,
            onEventSelected: @escaping (any EventAbs) -> Void,
            onPlaceSelected: @escaping (MVPPlace) -> Void,
            canClickPOI: Bool,
            focusedLocation: LatLng?,
            focusedEvent: (any EventAbs)?,
            revealCenterX: Double,
            revealCenterY: Double
        ) {
            guard let hostingController = viewController as? UIHostingController<EventMap> else {
                return
            }
            
            let centerPoint = CGPoint(x: revealCenterX, y: revealCenterY)
            
            // Update the SwiftUI view with new parameters
            let updatedView = EventMap(
                component: component,
                onEventSelected: onEventSelected,
                onPlaceSelected: onPlaceSelected,
                canClickPOI: canClickPOI,
                focusedLocation: focusedLocation,
                focusedEvent: focusedEvent,
                revealCenter: centerPoint
            )
            
            hostingController.rootView = updatedView
        }
    
    func createNativePlatformDatePicker(
        initialDate: Kotlinx_datetimeInstant,
        minDate: Kotlinx_datetimeInstant,
        maxDate: Kotlinx_datetimeInstant,
        onDateSelected: @escaping (Kotlinx_datetimeInstant?) -> Void,
        onDismissRequest: @escaping () -> Void
    ) {
        let scenes = UIApplication.shared.connectedScenes
        guard let windowScene = scenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = windowScene.windows.first(where: \.isKeyWindow)
        else { return }

        let initialDateSwift = Date(timeIntervalSince1970: TimeInterval(initialDate.epochSeconds))
        let minDateSwift = Date(timeIntervalSince1970: TimeInterval(minDate.epochSeconds))
        let maxDateSwift = Date(timeIntervalSince1970: TimeInterval(maxDate.epochSeconds))

        let vc = DateTimePickerViewController(
            initialDate: initialDateSwift,
            minDate: minDateSwift,
            maxDate: maxDateSwift,
            onConfirm: { date in
                let instant = Kotlinx_datetimeInstant.companion.fromEpochMilliseconds(
                    epochMilliseconds: Int64(date.timeIntervalSince1970 * 1000)
                )
                onDateSelected(instant)
                window.rootViewController?.dismiss(animated: true)
            },
            onDismiss: {
                onDismissRequest()
                window.rootViewController?.dismiss(animated: true)
            }
        )

        window.rootViewController?.present(vc, animated: true)
    }
}
