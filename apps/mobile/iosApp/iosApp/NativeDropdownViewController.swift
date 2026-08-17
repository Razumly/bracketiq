//
//  NativeDropdownViewController.swift
//  iosApp
//
//  Created by Elesey Razumovskiy on 8/5/25.
//  Copyright © 2025 orgName. All rights reserved.
//

import Foundation
import UIKit

class NativeDropdownViewController: UIViewController {
    private let button = UIButton(type: .system)
    private var options: [String] = []
    private var onSelectionChange: ((String) -> Void)?
    private var selectedValue: String = ""
    
    init(selectedValue: String, options: [String], placeholder: String, onSelectionChange: @escaping (String) -> Void) {
        super.init(nibName: nil, bundle: nil)
        self.selectedValue = selectedValue
        self.options = options
        self.onSelectionChange = onSelectionChange
        
        setupButton(placeholder: placeholder)
    }
    
    private func setupButton(placeholder: String) {
        // Style button to look like a text field
        button.layer.cornerRadius = 8.0
        button.layer.borderWidth = 1.0
        button.contentHorizontalAlignment = .left
        button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 32)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 16)
        
        // Set title
        let displayText = selectedValue.isEmpty ? placeholder : selectedValue
        button.setTitle(displayText, for: .normal)
        
        // Add dropdown arrow
        let arrowImage = UIImage(systemName: "chevron.down")
        button.setImage(arrowImage, for: .normal)
        button.semanticContentAttribute = .forceRightToLeft
        button.tintColor = placeholderColor
        applyButtonTheme()
        
        button.addTarget(self, action: #selector(showActionSheet), for: .touchUpInside)
        
        view.addSubview(button)
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            button.topAnchor.constraint(equalTo: view.topAnchor),
            button.heightAnchor.constraint(equalToConstant: 44)
        ])
    }
    
    @objc private func showActionSheet() {
        let actionSheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        
        // Add options
        for option in options {
            let action = UIAlertAction(title: option, style: .default) { [weak self] _ in
                self?.selectOption(option)
            }
            actionSheet.addAction(action)
        }
        
        // Add cancel button
        actionSheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        
        // For iPad support
        if let popover = actionSheet.popoverPresentationController {
            popover.sourceView = button
            popover.sourceRect = button.bounds
        }
        
        present(actionSheet, animated: true)
    }
    
    private func selectOption(_ option: String) {
        selectedValue = option
        button.setTitle(option, for: .normal)
        applyButtonTheme()
        onSelectionChange?(option)
    }
    
    func updateDropdown(selectedValue: String, options: [String], placeholder: String, onSelectionChange: @escaping (String) -> Void) {
        self.selectedValue = selectedValue
        self.options = options
        self.onSelectionChange = onSelectionChange
        
        let displayText = selectedValue.isEmpty ? placeholder : selectedValue
        button.setTitle(displayText, for: .normal)
        applyButtonTheme()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        applyButtonTheme()
    }

    private func applyButtonTheme() {
        button.backgroundColor = fieldBackgroundColor
        button.layer.borderColor = fieldBorderColor.cgColor
        button.setTitleColor(selectedValue.isEmpty ? placeholderColor : fieldTextColor, for: .normal)
        button.tintColor = selectedValue.isEmpty ? placeholderColor : fieldTextColor
    }

    private var isDarkMode: Bool {
        traitCollection.userInterfaceStyle == .dark
    }

    private var fieldBackgroundColor: UIColor {
        if button.isEnabled {
            return isDarkMode ? UIColor(hex: 0x172131) : UIColor(hex: 0xF8FAFC)
        }
        return isDarkMode ? UIColor(hex: 0x1C2738) : UIColor(hex: 0xE7EDF3)
    }

    private var fieldBorderColor: UIColor {
        isDarkMode ? UIColor(hex: 0x344255) : UIColor(hex: 0xD3DCE6)
    }

    private var fieldTextColor: UIColor {
        isDarkMode ? UIColor(hex: 0xEDF3FA) : UIColor(hex: 0x1E2633)
    }

    private var placeholderColor: UIColor {
        isDarkMode ? UIColor(hex: 0xAEB9C7) : UIColor(hex: 0x6B7785)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255.0,
            green: CGFloat((hex >> 8) & 0xFF) / 255.0,
            blue: CGFloat(hex & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}

extension IOSNativeViewFactory {
    func createNativeDropdown(
        selectedValue: String,
        options: [String],
        placeholder: String,
        onSelectionChange: @escaping (String) -> Void
    ) -> UIViewController {
        return NativeDropdownViewController(
            selectedValue: selectedValue,
            options: options,
            placeholder: placeholder,
            onSelectionChange: onSelectionChange
        )
    }
    
    func updateNativeDropdown(
        viewController: UIViewController,
        selectedValue: String,
        options: [String],
        placeholder: String,
        onSelectionChange: @escaping (String) -> Void
    ) {
        guard let dropdownVC = viewController as? NativeDropdownViewController else { return }
        dropdownVC.updateDropdown(
            selectedValue: selectedValue,
            options: options,
            placeholder: placeholder,
            onSelectionChange: onSelectionChange
        )
    }
}
