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
        
        let view = DateTimePickerView(
            initialDate: initialDate,
            minDate: minDate,
            maxDate: maxDate,
            getTime: getTime,
            showDate: showDate,
            onConfirm: { date in
                onConfirm(date)
                // Don't call onDismiss here since the caller handles dismissal
            },
            onDismiss: {
                onDismiss()
                // Don't call onDismiss here since the caller handles dismissal
            }
        )
        
        super.init(rootView: view)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // SOLUTION: Override viewDidDisappear to catch swipe-to-dismiss
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        
        // Only call dismiss callback if we haven't already called it
        // and the view controller is being dismissed (not just hidden)
        if !hasCalledDismiss && isBeingDismissed {
            hasCalledDismiss = true
            onDismissCallback()
        }
    }
    
    // ALTERNATIVE: Override dismiss methods to ensure callback is called
    override func dismiss(animated flag: Bool, completion: (() -> Void)? = nil) {
        if !hasCalledDismiss {
            hasCalledDismiss = true
            onDismissCallback()
        }
        super.dismiss(animated: flag, completion: completion)
    }
}
