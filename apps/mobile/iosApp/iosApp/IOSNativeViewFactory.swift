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
import StripePaymentSheet

class IOSNativeViewFactory: NativeViewFactory {
    static var shared = IOSNativeViewFactory()
    
    func createNativeMapView(
        component: MapComponent,
        onEventSelected: @escaping (Event) -> Void,
        onPlaceSelected: @escaping (MVPPlace) -> Void,
        onPlaceSelectionPoint: @escaping (KotlinFloat, KotlinFloat) -> Void,
        selectionRequiresConfirmation: Bool,
        originalPlace: MVPPlace?,
        selectedPlace: MVPPlace?,
        onPlaceSelectionCleared: @escaping () -> Void,
        canClickPOI: Bool,
        focusedLocation: LatLng?,
        focusedEvent: (Event)?,
        recenterRequestToken: Int32,
        locationButtonBottomPadding: Float
    ) -> UIViewController {
        let view = EventMap(
            component: component,
            onEventSelected: onEventSelected,
            onPlaceSelected: onPlaceSelected,
            onPlaceSelectionPoint: onPlaceSelectionPoint,
            selectionRequiresConfirmation: selectionRequiresConfirmation,
            originalPlace: originalPlace,
            selectedPlace: selectedPlace,
            onPlaceSelectionCleared: onPlaceSelectionCleared,
            canClickPOI: canClickPOI,
            focusedLocation: focusedLocation,
            focusedEvent: focusedEvent,
            recenterRequestToken: Int(recenterRequestToken),
            locationButtonBottomPadding: CGFloat(locationButtonBottomPadding)
        )
        
        let hostingController = UIHostingController(rootView: view)
        
        // Make the hosting controller's view transparent
        hostingController.view.backgroundColor = UIColor.clear
        
        return hostingController
    }
    
    func updateNativeMapView(
            viewController: UIViewController,
            component: MapComponent,
            onEventSelected: @escaping (Event) -> Void,
            onPlaceSelected: @escaping (MVPPlace) -> Void,
            onPlaceSelectionPoint: @escaping (KotlinFloat, KotlinFloat) -> Void,
            selectionRequiresConfirmation: Bool,
            originalPlace: MVPPlace?,
            selectedPlace: MVPPlace?,
            onPlaceSelectionCleared: @escaping () -> Void,
            canClickPOI: Bool,
            focusedLocation: LatLng?,
            focusedEvent: (Event)?,
            recenterRequestToken: Int32,
            locationButtonBottomPadding: Float
        ) {
            guard let hostingController = viewController as? UIHostingController<EventMap> else {
                return
            }

            let updatedView = EventMap(
                component: component,
                onEventSelected: onEventSelected,
                onPlaceSelected: onPlaceSelected,
                onPlaceSelectionPoint: onPlaceSelectionPoint,
                selectionRequiresConfirmation: selectionRequiresConfirmation,
                originalPlace: originalPlace,
                selectedPlace: selectedPlace,
                onPlaceSelectionCleared: onPlaceSelectionCleared,
                canClickPOI: canClickPOI,
                focusedLocation: focusedLocation,
                focusedEvent: focusedEvent,
                recenterRequestToken: Int(recenterRequestToken),
                locationButtonBottomPadding: CGFloat(locationButtonBottomPadding)
            )

            hostingController.rootView = updatedView
        }
    
    func createNativePlatformDatePicker(
        initialDate: KotlinInstant,
        minDate: KotlinInstant,
        maxDate: KotlinInstant,
        getTime: Bool,
        showDate: Bool,
        onDateSelected: @escaping (KotlinInstant?) -> Void,
        onDismissRequest: @escaping () -> Void
    ) {
        DispatchQueue.main.async {
            guard let presentingViewController = self.getTopViewController() else {
                onDismissRequest()
                return
            }

            if presentingViewController is DateTimePickerViewController ||
                presentingViewController.presentedViewController is DateTimePickerViewController {
                return
            }

            let initialDateSwift = Date(timeIntervalSince1970: TimeInterval(initialDate.epochSeconds))
            let minDateSwift = Date(timeIntervalSince1970: TimeInterval(minDate.epochSeconds))
            let maxDateSwift = Date(timeIntervalSince1970: TimeInterval(maxDate.epochSeconds))

            let vc = DateTimePickerViewController(
                initialDate: initialDateSwift,
                minDate: minDateSwift,
                maxDate: maxDateSwift,
                getTime: getTime,
                showDate: showDate,
                onConfirm: { date in
                    let instant = KotlinInstant.companion.fromEpochMilliseconds(
                        epochMilliseconds: Int64(date.timeIntervalSince1970 * 1000)
                    )
                    onDateSelected(instant)
                },
                onDismiss: {
                    onDismissRequest()
                }
            )

            presentingViewController.present(vc, animated: true)
        }
    }
        
    func presentStripePaymentSheet(
        publishableKey: String,
        customerId: String?,
        ephemeralKey: String?,
        paymentIntent: String,
        billingName: String?,
        billingEmail: String?,
        billingAddress: BillingAddressDraft?,
        onPaymentResult: @escaping (PaymentResult) -> Void
    ) {
        // Configure Stripe
        STPAPIClient.shared.publishableKey = publishableKey
        
        var configuration = PaymentSheet.Configuration()
        configuration.merchantDisplayName = "BracketIQ"
        if let customerId = customerId, let ephemeralKey = ephemeralKey {
            configuration.customer = .init(id: customerId, ephemeralKeySecret: ephemeralKey)
        }
        configuration.allowsDelayedPaymentMethods = true
        var defaultBillingDetails = PaymentSheet.BillingDetails()
        defaultBillingDetails.name = billingName
        defaultBillingDetails.email = billingEmail
        if let billingAddress = billingAddress {
            var address = PaymentSheet.Address()
            address.line1 = billingAddress.line1
            address.line2 = billingAddress.line2
            address.city = billingAddress.city
            address.state = billingAddress.state
            address.postalCode = billingAddress.postalCode
            address.country = billingAddress.countryCode
            defaultBillingDetails.address = address
        }
        configuration.defaultBillingDetails = defaultBillingDetails
        
        let paymentSheet = PaymentSheet(
            paymentIntentClientSecret: paymentIntent,
            configuration: configuration
        )
        
        // Get the presenting view controller
        guard let presentingViewController = self.getTopViewController() else {
            onPaymentResult(PaymentResult.Failed(error: "No presenting view controller found"))
            return
        }
        
        DispatchQueue.main.async {
            paymentSheet.present(from: presentingViewController) { result in
                let paymentResult = self.convertPaymentSheetResult(result)
                onPaymentResult(paymentResult)
            }
        }
    }
    
    private func getTopViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
        guard let windowScene = scenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = windowScene.windows.first(where: \.isKeyWindow)
        else { return nil }
        
        var topViewController = window.rootViewController
        while let presentedViewController = topViewController?.presentedViewController {
            topViewController = presentedViewController
        }
        return topViewController
    }
    
    private func convertPaymentSheetResult(_ result: PaymentSheetResult) -> PaymentResult {
        switch result {
        case .completed:
            return PaymentResult.Completed()
        case .canceled:
            return PaymentResult.Canceled()
        case .failed(let error):
            return PaymentResult.Failed(error: error.localizedDescription)
        }
    }
}
