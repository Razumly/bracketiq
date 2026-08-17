//
// NativeDatePicker.swift
// iosApp
//
// Created by Elesey Razumovskiy on 6/3/25.
// Copyright © 2025 orgName. All rights reserved.
//

import SwiftUI
import UIKit
import ComposeApp

struct DateTimePickerView: View {
    @State private var selectedDate: Date
    let minDate: Date
    let maxDate: Date
    let getTime: Bool
    let showDate: Bool
    let onConfirm: (Date) -> Void
    let onDismiss: () -> Void
    
    init(
        initialDate: Date,
        minDate: Date,
        maxDate: Date,
        getTime: Bool,
        showDate: Bool,
        onConfirm: @escaping (Date) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedDate = State(initialValue: initialDate)
        self.minDate = minDate
        self.maxDate = maxDate
        self.getTime = getTime
        self.showDate = showDate
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
    }
    
    var body: some View {
        VStack {
            if showDate {
                DatePicker(
                    "",
                    selection: $selectedDate,
                    in: minDate...maxDate,
                    displayedComponents: [.date]
                )
                .datePickerStyle(.graphical)
            }
            
            if (getTime) {
                DatePicker(
                    "",
                    selection: $selectedDate,
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
            }
            
            HStack {
                Button("Cancel", action: onDismiss)
                Spacer()
                Button("OK", action: { onConfirm(selectedDate) })
            }
            .padding()
        }
        .padding()
    }
}

class DateTimePickerViewController: UIHostingController<DateTimePickerView> {
    private let onDismissCallback: () -> Void
    private var hasCalledDismiss = false
    
    init(
        initialDate: Date,
        minDate: Date,
        maxDate: Date,
        getTime: Bool,
        showDate: Bool,
        onConfirm: @escaping (Date) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.onDismissCallback = onDismiss
        
        let placeholderView = DateTimePickerView(
            initialDate: initialDate,
            minDate: minDate,
            maxDate: maxDate,
            getTime: getTime,
            showDate: showDate,
            onConfirm: onConfirm,
            onDismiss: {}
        )
        
        super.init(rootView: placeholderView)
        
        self.rootView = DateTimePickerView(
            initialDate: initialDate,
            minDate: minDate,
            maxDate: maxDate,
            getTime: getTime,
            showDate: showDate,
            onConfirm: { [weak self] date in
                onConfirm(date)
                self?.dismiss(animated: true)
            },
            onDismiss: { [weak self] in
                self?.dismiss(animated: true)
            }
        )
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        
        if !hasCalledDismiss && isBeingDismissed {
            hasCalledDismiss = true
            onDismissCallback()
        }
    }
    
    override func dismiss(animated flag: Bool, completion: (() -> Void)? = nil) {
        let shouldNotifyDismiss = !hasCalledDismiss
        if shouldNotifyDismiss {
            hasCalledDismiss = true
        }
        
        super.dismiss(animated: flag) { [onDismissCallback] in
            if shouldNotifyDismiss {
                onDismissCallback()
            }
            completion?()
        }
    }
}
