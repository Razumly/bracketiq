//
//  NativeDatePicker.swift
//  iosApp
//
//  Created by Elesey Razumovskiy on 6/3/25.
//  Copyright © 2025 orgName. All rights reserved.
//


import SwiftUI
import UIKit
import ComposeApp

struct DateTimePickerView: View {
    @State private var selectedDate: Date
    let minDate: Date
    let maxDate: Date
    let getTime: Bool
    let onConfirm: (Date) -> Void
    let onDismiss: () -> Void
    
    init(
        initialDate: Date,
        minDate: Date,
        maxDate: Date,
        getTime: Bool,
        onConfirm: @escaping (Date) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedDate = State(initialValue: initialDate)
        self.minDate = minDate
        self.maxDate = maxDate
        self.getTime = getTime
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
    }
    
    var body: some View {
        VStack {
            DatePicker(
                "",
                selection: $selectedDate,
                in: minDate...maxDate,
                displayedComponents: [.date]
            )
            .datePickerStyle(.graphical)
            
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
    init(
        initialDate: Date,
        minDate: Date,
        maxDate: Date,
        getTime: Bool,
        onConfirm: @escaping (Date) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        let view = DateTimePickerView(
            initialDate: initialDate,
            minDate: minDate,
            maxDate: maxDate,
            getTime: getTime,
            onConfirm: onConfirm,
            onDismiss: onDismiss
        )
        super.init(rootView: view)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
