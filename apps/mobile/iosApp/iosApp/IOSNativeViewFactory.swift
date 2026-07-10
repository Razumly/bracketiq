//
//  iOSNativeViewFactory.swift
//  iosApp
//
//  Created by Elesey Razumovskiy on 6/3/25.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation
import ComposeApp
import CoreImage
import UIKit
import SwiftUI
import StripePaymentSheet

class IOSNativeViewFactory: NativeViewFactory {
    static var shared = IOSNativeViewFactory()

    func createNativeEventCard(
        data: NativeEventCardData,
        bottomPadding: Float,
        onCardClick: @escaping () -> Void,
        onMapClick: @escaping (KotlinFloat, KotlinFloat) -> Void
    ) -> UIViewController {
        NativeEventCardViewController(
            data: data,
            bottomPadding: CGFloat(bottomPadding),
            onCardClick: onCardClick,
            onMapClick: onMapClick
        )
    }

    func updateNativeEventCard(
        viewController: UIViewController,
        data: NativeEventCardData,
        bottomPadding: Float,
        onCardClick: @escaping () -> Void,
        onMapClick: @escaping (KotlinFloat, KotlinFloat) -> Void
    ) {
        guard let eventCardController = viewController as? NativeEventCardViewController else {
            return
        }

        eventCardController.update(
            data: data,
            bottomPadding: CGFloat(bottomPadding),
            onCardClick: onCardClick,
            onMapClick: onMapClick
        )
    }
    
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
        organizationLogoIdsById: [String: String],
        focusedLocation: LatLng?,
        focusedEvent: (Event)?,
        showSelectedEventCards: Bool,
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
            organizationLogoIdsById: organizationLogoIdsById,
            focusedLocation: focusedLocation,
            focusedEvent: focusedEvent,
            showSelectedEventCards: showSelectedEventCards,
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
            organizationLogoIdsById: [String: String],
            focusedLocation: LatLng?,
            focusedEvent: (Event)?,
            showSelectedEventCards: Bool,
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
                organizationLogoIdsById: organizationLogoIdsById,
                focusedLocation: focusedLocation,
                focusedEvent: focusedEvent,
                showSelectedEventCards: showSelectedEventCards,
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

private final class NativeEventCardViewController: UIViewController, UIGestureRecognizerDelegate {
    private static let imageCache = NSCache<NSString, UIImage>()
    private static let ciContext = CIContext(options: nil)

    private let imageView = UIImageView()
    private let blurredImageView = UIImageView()
    private let blurView = UIVisualEffectView()
    private let panelTintView = UIView()
    private let blurredImageMaskLayer = CAGradientLayer()
    private let blurMaskLayer = CAGradientLayer()
    private let tintGradientLayer = CAGradientLayer()
    private let stackView = UIStackView()
    private let mapButtonGlassView = UIVisualEffectView()
    private let mapButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let locationRow = UIStackView()
    private let locationIcon = UIImageView()
    private let locationLabel = UILabel()
    private let eventTypeRow = UIStackView()
    private let eventTypeLabel = UILabel()
    private let prizeLabel = UILabel()
    private let registrationLabel = UILabel()
    private let divisionLabel = UILabel()
    private let dividerView = UIView()
    private let bottomRow = UIStackView()
    private let dateLabel = UILabel()
    private let priceLabel = UILabel()
    private let lifecycleLabel = UILabel()

    private var imageTask: URLSessionDataTask?
    private var currentImageUrl: String?
    private var blurRenderWorkItem: DispatchWorkItem?
    private weak var lastBlurSourceImage: UIImage?
    private var lastBlurCardSize: CGSize = .zero
    private var lastBlurPanelSize: CGSize = .zero
    private var lastBlurUsesLogoFallback: Bool = false
    private var usesLogoFallback: Bool = false
    private var bottomPadding: CGFloat
    private var onCardClick: () -> Void
    private var onMapClick: (KotlinFloat, KotlinFloat) -> Void

    init(
        data: NativeEventCardData,
        bottomPadding: CGFloat,
        onCardClick: @escaping () -> Void,
        onMapClick: @escaping (KotlinFloat, KotlinFloat) -> Void
    ) {
        self.bottomPadding = bottomPadding
        self.onCardClick = onCardClick
        self.onMapClick = onMapClick
        super.init(nibName: nil, bundle: nil)
        configureView()
        apply(data: data)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        imageTask?.cancel()
        blurRenderWorkItem?.cancel()
    }

    func update(
        data: NativeEventCardData,
        bottomPadding: CGFloat,
        onCardClick: @escaping () -> Void,
        onMapClick: @escaping (KotlinFloat, KotlinFloat) -> Void
    ) {
        self.bottomPadding = bottomPadding
        self.onCardClick = onCardClick
        self.onMapClick = onMapClick
        updatePanelConstraints()
        apply(data: data)
    }

    private var panelHeightConstraint: NSLayoutConstraint?
    private var stackBottomConstraint: NSLayoutConstraint?
    private var lifecycleBottomConstraint: NSLayoutConstraint?

    private func configureView() {
        view.backgroundColor = .clear
        view.clipsToBounds = true

        let cardTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleCardTap))
        cardTapRecognizer.delegate = self
        view.addGestureRecognizer(cardTapRecognizer)

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.backgroundColor = UIColor(red: 0.08, green: 0.10, blue: 0.14, alpha: 1.0)
        view.addSubview(imageView)

        blurredImageView.translatesAutoresizingMaskIntoConstraints = false
        blurredImageView.contentMode = .scaleAspectFill
        blurredImageView.clipsToBounds = true
        blurredImageView.alpha = 0.96
        blurredImageMaskLayer.colors = [
            UIColor.clear.cgColor,
            UIColor.white.withAlphaComponent(0.76).cgColor,
            UIColor.white.cgColor,
        ]
        blurredImageMaskLayer.locations = [0.0, 0.28, 0.68]
        blurredImageMaskLayer.startPoint = CGPoint(x: 0.5, y: 0.0)
        blurredImageMaskLayer.endPoint = CGPoint(x: 0.5, y: 1.0)
        blurredImageView.layer.mask = blurredImageMaskLayer
        view.addSubview(blurredImageView)

        blurView.translatesAutoresizingMaskIntoConstraints = false
        blurView.effect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        blurMaskLayer.colors = [
            UIColor.clear.cgColor,
            UIColor.white.withAlphaComponent(0.65).cgColor,
            UIColor.white.cgColor,
        ]
        blurMaskLayer.locations = [0.0, 0.34, 0.74]
        blurMaskLayer.startPoint = CGPoint(x: 0.5, y: 0.0)
        blurMaskLayer.endPoint = CGPoint(x: 0.5, y: 1.0)
        blurView.layer.mask = blurMaskLayer
        view.addSubview(blurView)

        panelTintView.translatesAutoresizingMaskIntoConstraints = false
        panelTintView.backgroundColor = .clear
        panelTintView.isUserInteractionEnabled = false
        tintGradientLayer.colors = [
            UIColor.clear.cgColor,
            UIColor(red: 0.08, green: 0.10, blue: 0.15, alpha: 0.30).cgColor,
            UIColor(red: 0.08, green: 0.10, blue: 0.15, alpha: 0.58).cgColor,
        ]
        tintGradientLayer.locations = [0.0, 0.38, 1.0]
        tintGradientLayer.startPoint = CGPoint(x: 0.5, y: 0.0)
        tintGradientLayer.endPoint = CGPoint(x: 0.5, y: 1.0)
        panelTintView.layer.addSublayer(tintGradientLayer)
        view.addSubview(panelTintView)

        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 6
        stackView.alignment = .fill
        view.addSubview(stackView)

        configureMapButton()
        configureLabels()
        configureRows()
        configureLifecycleLabel()

        panelHeightConstraint = blurView.heightAnchor.constraint(equalToConstant: 288 + bottomPadding)
        stackBottomConstraint = stackView.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -(20 + bottomPadding))
        lifecycleBottomConstraint = lifecycleLabel.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -(bottomPadding + 12))

        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: view.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            blurredImageView.leadingAnchor.constraint(equalTo: blurView.leadingAnchor),
            blurredImageView.trailingAnchor.constraint(equalTo: blurView.trailingAnchor),
            blurredImageView.topAnchor.constraint(equalTo: blurView.topAnchor),
            blurredImageView.bottomAnchor.constraint(equalTo: blurView.bottomAnchor),

            blurView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            blurView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            panelHeightConstraint!,

            panelTintView.topAnchor.constraint(equalTo: blurView.topAnchor),
            panelTintView.leadingAnchor.constraint(equalTo: blurView.leadingAnchor),
            panelTintView.trailingAnchor.constraint(equalTo: blurView.trailingAnchor),
            panelTintView.bottomAnchor.constraint(equalTo: blurView.bottomAnchor),

            stackView.topAnchor.constraint(greaterThanOrEqualTo: blurView.topAnchor, constant: 42),
            stackView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            stackView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            stackBottomConstraint!,

            lifecycleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            lifecycleBottomConstraint!,
        ])
    }

    private func configureMapButton() {
        var configuration = UIButton.Configuration.plain()
        configuration.title = "View on Map"
        configuration.image = Self.makeMapPinIcon(
            size: CGSize(width: 22, height: 22),
            color: UIColor(red: 0.07, green: 0.12, blue: 0.20, alpha: 1.0)
        )
        configuration.imagePlacement = .trailing
        configuration.imagePadding = 6
        configuration.baseBackgroundColor = .clear
        configuration.baseForegroundColor = UIColor(red: 0.07, green: 0.12, blue: 0.20, alpha: 1.0)
        configuration.cornerStyle = .capsule
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 9, leading: 18, bottom: 9, trailing: 14)
        mapButton.configuration = configuration
        mapButton.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        mapButton.contentHorizontalAlignment = .leading
        mapButton.addTarget(self, action: #selector(handleMapTap), for: .touchUpInside)

        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        mapButtonGlassView.translatesAutoresizingMaskIntoConstraints = false
        mapButtonGlassView.effect = UIBlurEffect(style: .systemThinMaterialLight)
        mapButtonGlassView.clipsToBounds = true
        mapButtonGlassView.layer.cornerRadius = 23
        mapButtonGlassView.contentView.backgroundColor = UIColor(red: 0.72, green: 0.86, blue: 1.0, alpha: 0.42)
        container.addSubview(mapButtonGlassView)
        mapButton.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(mapButton)
        stackView.addArrangedSubview(container)

        NSLayoutConstraint.activate([
            mapButtonGlassView.topAnchor.constraint(equalTo: mapButton.topAnchor),
            mapButtonGlassView.leadingAnchor.constraint(equalTo: mapButton.leadingAnchor),
            mapButtonGlassView.trailingAnchor.constraint(equalTo: mapButton.trailingAnchor),
            mapButtonGlassView.bottomAnchor.constraint(equalTo: mapButton.bottomAnchor),

            mapButton.topAnchor.constraint(equalTo: container.topAnchor),
            mapButton.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            mapButton.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            mapButton.heightAnchor.constraint(equalToConstant: 46),
        ])
    }

    private func configureLabels() {
        titleLabel.font = UIFont.systemFont(ofSize: 23, weight: .heavy)
        titleLabel.textColor = .white
        titleLabel.numberOfLines = 1
        titleLabel.lineBreakMode = .byTruncatingTail

        locationLabel.font = UIFont.systemFont(ofSize: 16, weight: .regular)
        locationLabel.textColor = .white
        locationLabel.numberOfLines = 1
        locationLabel.lineBreakMode = .byTruncatingTail

        eventTypeLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        eventTypeLabel.textColor = .white
        eventTypeLabel.numberOfLines = 1
        eventTypeLabel.lineBreakMode = .byTruncatingTail

        prizeLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        prizeLabel.textColor = .white
        prizeLabel.numberOfLines = 1
        prizeLabel.textAlignment = .right
        prizeLabel.lineBreakMode = .byTruncatingTail

        registrationLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        registrationLabel.textColor = .white
        registrationLabel.numberOfLines = 1
        registrationLabel.lineBreakMode = .byTruncatingTail

        divisionLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        divisionLabel.textColor = .white
        divisionLabel.numberOfLines = 1
        divisionLabel.lineBreakMode = .byTruncatingTail

        dateLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        dateLabel.textColor = .white
        dateLabel.numberOfLines = 1

        priceLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        priceLabel.textColor = .white
        priceLabel.numberOfLines = 1
        priceLabel.textAlignment = .right
    }

    private func configureRows() {
        stackView.addArrangedSubview(titleLabel)

        locationIcon.image = Self.makeMapPinIcon(
            size: CGSize(width: 22, height: 22),
            color: .white
        )
        locationIcon.tintColor = .white
        locationIcon.contentMode = .scaleAspectFit
        locationIcon.translatesAutoresizingMaskIntoConstraints = false
        locationIcon.widthAnchor.constraint(equalToConstant: 20).isActive = true
        locationIcon.heightAnchor.constraint(equalToConstant: 20).isActive = true

        locationRow.axis = .horizontal
        locationRow.spacing = 6
        locationRow.alignment = .center
        locationRow.addArrangedSubview(locationIcon)
        locationRow.addArrangedSubview(locationLabel)
        stackView.addArrangedSubview(locationRow)

        eventTypeRow.axis = .horizontal
        eventTypeRow.spacing = 8
        eventTypeRow.alignment = .center
        eventTypeRow.addArrangedSubview(eventTypeLabel)
        eventTypeRow.addArrangedSubview(prizeLabel)
        eventTypeLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        prizeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        stackView.addArrangedSubview(eventTypeRow)

        stackView.addArrangedSubview(registrationLabel)
        stackView.addArrangedSubview(divisionLabel)

        dividerView.translatesAutoresizingMaskIntoConstraints = false
        dividerView.backgroundColor = UIColor.white.withAlphaComponent(0.88)
        stackView.addArrangedSubview(dividerView)
        dividerView.heightAnchor.constraint(equalToConstant: 2).isActive = true

        bottomRow.axis = .horizontal
        bottomRow.spacing = 8
        bottomRow.alignment = .center
        bottomRow.distribution = .fill
        bottomRow.addArrangedSubview(dateLabel)
        bottomRow.addArrangedSubview(priceLabel)
        dateLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        priceLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        stackView.addArrangedSubview(bottomRow)
    }

    private func configureLifecycleLabel() {
        lifecycleLabel.translatesAutoresizingMaskIntoConstraints = false
        lifecycleLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
        lifecycleLabel.textColor = .white
        lifecycleLabel.textAlignment = .center
        lifecycleLabel.layer.cornerRadius = 12
        lifecycleLabel.layer.masksToBounds = true
        lifecycleLabel.isHidden = true
        view.addSubview(lifecycleLabel)
    }

    private func apply(data: NativeEventCardData) {
        titleLabel.text = data.title
        locationLabel.text = data.location
        eventTypeLabel.text = data.eventTypeLabel
        registrationLabel.text = data.registrationLabel
        divisionLabel.text = data.divisionLabel
        dateLabel.text = data.dateLabel
        priceLabel.text = data.priceLabel

        if let prize = data.prizeLabel, !prize.isEmpty {
            prizeLabel.text = prize
            prizeLabel.isHidden = false
        } else {
            prizeLabel.text = nil
            prizeLabel.isHidden = true
        }

        if let lifecycle = data.lifecycleLabel, !lifecycle.isEmpty {
            lifecycleLabel.text = "  \(lifecycle)  "
            lifecycleLabel.backgroundColor = lifecycleColor(tone: data.lifecycleTone)
            lifecycleLabel.isHidden = false
        } else {
            lifecycleLabel.text = nil
            lifecycleLabel.isHidden = true
        }

        let shouldUseLogoFallback = data.usesLogoFallback
        imageView.contentMode = .scaleAspectFill
        imageView.backgroundColor = UIColor(red: 0.08, green: 0.10, blue: 0.14, alpha: 1.0)

        loadImage(from: data.imageUrl, usesLogoFallback: shouldUseLogoFallback)
    }

    private func loadImage(from imageUrl: String?, usesLogoFallback: Bool) {
        guard currentImageUrl != imageUrl || self.usesLogoFallback != usesLogoFallback else {
            return
        }

        currentImageUrl = imageUrl
        self.usesLogoFallback = usesLogoFallback
        imageTask?.cancel()
        imageView.image = nil
        blurredImageView.image = nil
        lastBlurSourceImage = nil

        guard let imageUrl, let url = URL(string: imageUrl) else {
            return
        }

        let cacheKey = imageUrl as NSString
        if let cachedImage = Self.imageCache.object(forKey: cacheKey) {
            setEventImage(cachedImage)
            return
        }

        imageTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, self.currentImageUrl == imageUrl else {
                return
            }

            guard let data, let image = UIImage(data: data) else {
                return
            }

            Self.imageCache.setObject(image, forKey: cacheKey)
            DispatchQueue.main.async {
                guard self.currentImageUrl == imageUrl else {
                    return
                }
                self.setEventImage(image)
            }
        }
        imageTask?.resume()
    }

    private func setEventImage(_ image: UIImage) {
        imageView.image = image
        updateBlurredPanelImageIfNeeded()
    }

    private func updatePanelConstraints() {
        panelHeightConstraint?.constant = 288 + bottomPadding
        stackBottomConstraint?.constant = -(20 + bottomPadding)
        lifecycleBottomConstraint?.constant = -(bottomPadding + 12)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        blurredImageMaskLayer.frame = blurredImageView.bounds
        blurMaskLayer.frame = blurView.bounds
        tintGradientLayer.frame = panelTintView.bounds
        updateBlurredPanelImageIfNeeded()
    }

    private func updateBlurredPanelImageIfNeeded() {
        guard let sourceImage = imageView.image else {
            blurredImageView.image = nil
            return
        }

        let cardSize = view.bounds.size
        let panelSize = blurView.bounds.size
        guard cardSize.width > 1, cardSize.height > 1, panelSize.width > 1, panelSize.height > 1 else {
            return
        }

        let roundedCardSize = CGSize(width: round(cardSize.width), height: round(cardSize.height))
        let roundedPanelSize = CGSize(width: round(panelSize.width), height: round(panelSize.height))
        guard lastBlurSourceImage !== sourceImage ||
                lastBlurCardSize != roundedCardSize ||
                lastBlurPanelSize != roundedPanelSize ||
                lastBlurUsesLogoFallback != usesLogoFallback else {
            return
        }

        lastBlurSourceImage = sourceImage
        lastBlurCardSize = roundedCardSize
        lastBlurPanelSize = roundedPanelSize
        lastBlurUsesLogoFallback = usesLogoFallback
        blurRenderWorkItem?.cancel()

        var workItem: DispatchWorkItem!
        workItem = DispatchWorkItem { [weak self, weak sourceImage] in
            guard let sourceImage else {
                return
            }

            let blurredImage = Self.makeBlurredPanelImage(
                sourceImage: sourceImage,
                cardSize: roundedCardSize,
                panelSize: roundedPanelSize
            )

            DispatchQueue.main.async { [weak self, weak sourceImage] in
                guard let self, !workItem.isCancelled, self.imageView.image === sourceImage else {
                    return
                }

                self.blurredImageView.image = blurredImage
            }
        }

        blurRenderWorkItem = workItem
        DispatchQueue.global(qos: .userInitiated).async(execute: workItem)
    }

    private static func makeBlurredPanelImage(
        sourceImage: UIImage,
        cardSize: CGSize,
        panelSize: CGSize
    ) -> UIImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = min(UIScreen.main.scale, 2.0)
        format.opaque = true

        let panelSnapshot = UIGraphicsImageRenderer(size: panelSize, format: format).image { _ in
            let sourceSize = sourceImage.size
            guard sourceSize.width > 0, sourceSize.height > 0 else {
                return
            }

            let scale = max(cardSize.width / sourceSize.width, cardSize.height / sourceSize.height)
            let drawSize = CGSize(width: sourceSize.width * scale, height: sourceSize.height * scale)
            let drawOrigin = CGPoint(
                x: (cardSize.width - drawSize.width) / 2,
                y: (cardSize.height - drawSize.height) / 2 - (cardSize.height - panelSize.height)
            )

            sourceImage.draw(in: CGRect(origin: drawOrigin, size: drawSize))
        }

        guard let inputImage = CIImage(image: panelSnapshot) else {
            return panelSnapshot
        }

        guard let filter = CIFilter(name: "CIGaussianBlur") else {
            return panelSnapshot
        }
        filter.setValue(inputImage, forKey: kCIInputImageKey)
        filter.setValue(18, forKey: kCIInputRadiusKey)

        guard let outputImage = filter.outputImage,
              let cgImage = ciContext.createCGImage(outputImage, from: inputImage.extent) else {
            return panelSnapshot
        }

        return UIImage(cgImage: cgImage, scale: panelSnapshot.scale, orientation: .up)
    }

    private static func makeMapPinIcon(size: CGSize, color: UIColor) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = UIScreen.main.scale
        format.opaque = false

        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            let scaleX = size.width / 24
            let scaleY = size.height / 24

            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                CGPoint(x: x * scaleX, y: y * scaleY)
            }

            let path = UIBezierPath()
            path.move(to: point(12, 22))
            path.addCurve(
                to: point(5, 9),
                controlPoint1: point(10.8, 20.6),
                controlPoint2: point(5, 14.0)
            )
            path.addCurve(
                to: point(12, 2),
                controlPoint1: point(5, 5.13),
                controlPoint2: point(8.13, 2)
            )
            path.addCurve(
                to: point(19, 9),
                controlPoint1: point(15.87, 2),
                controlPoint2: point(19, 5.13)
            )
            path.addCurve(
                to: point(12, 22),
                controlPoint1: point(19, 14.0),
                controlPoint2: point(13.2, 20.6)
            )
            path.close()

            path.append(UIBezierPath(ovalIn: CGRect(
                x: 9.25 * scaleX,
                y: 6.75 * scaleY,
                width: 5.5 * scaleX,
                height: 5.5 * scaleY
            )))
            path.usesEvenOddFillRule = true
            color.setFill()
            path.fill()
        }.withRenderingMode(.alwaysOriginal)
    }

    private func lifecycleColor(tone: String?) -> UIColor {
        switch tone {
        case "draft":
            return UIColor(red: 0.83, green: 0.18, blue: 0.18, alpha: 1.0)
        default:
            return UIColor(red: 0.08, green: 0.40, blue: 0.75, alpha: 1.0)
        }
    }

    @objc private func handleMapTap() {
        let center = mapButton.superview?.convert(mapButton.center, to: nil) ?? mapButton.center
        onMapClick(
            KotlinFloat(float: Float(center.x)),
            KotlinFloat(float: Float(center.y))
        )
    }

    @objc private func handleCardTap() {
        onCardClick()
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var touchedView: UIView? = touch.view
        while let currentView = touchedView {
            if currentView === mapButton {
                return false
            }
            touchedView = currentView.superview
        }
        return true
    }
}
