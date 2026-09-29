import Foundation
import RevenueCat
import SwiftUI

class SubscriptionManager: ObservableObject {
    static let shared = SubscriptionManager()
    
    @Published var isPro = false
    @Published var offerings: Offerings?
    @Published var customerInfo: CustomerInfo?
    
    private let entitlementID = "zavvi innovations Pro"
    
    private init() {
        // Initial state
        refreshCustomerInfo()
    }
    
    /// Initialize RevenueCat SDK
    func configure() {
        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: "test_dCdyoioMFzDLnWvQvcyPaxcikGn")
        
        // Listen for customer info updates
        Purchases.shared.delegate = self
        
        refreshCustomerInfo()
        loadOfferings()
    }
    
    /// Fetch the latest customer info and update entitlement status
    func refreshCustomerInfo() {
        Purchases.shared.getCustomerInfo { [weak self] (customerInfo, error) in
            self?.updateEntitlement(with: customerInfo)
        }
    }
    
    /// Load available products/offerings from RevenueCat dashboard
    func loadOfferings() {
        Purchases.shared.getOfferings { [weak self] (offerings, error) in
            self?.offerings = offerings
        }
    }
    
    /// Update the isPro state based on customer info
    private func updateEntitlement(with customerInfo: CustomerInfo?) {
        self.customerInfo = customerInfo
        if let entitlements = customerInfo?.entitlements {
            self.isPro = entitlements[entitlementID]?.isActive ?? false
        } else {
            self.isPro = false
        }
        print("Subscription Status: \(isPro ? "PRO" : "FREE")")
    }
    
    /// Purchase a package
    func purchase(package: Package, completion: @escaping (Bool) -> Void) {
        Purchases.shared.purchase(package: package) { [weak self] (transaction, customerInfo, error, userCancelled) in
            if let error = error {
                print("Purchase Error: \(error.localizedDescription)")
                completion(false)
                return
            }
            
            if !userCancelled {
                self?.updateEntitlement(with: customerInfo)
                completion(true)
            } else {
                completion(false)
            }
        }
    }
    
    /// Restore previous purchases
    func restorePurchases() {
        Purchases.shared.restorePurchases { [weak self] (customerInfo, error) in
            self?.updateEntitlement(with: customerInfo)
        }
    }
    
    // MARK: - Product Helpers
    
    var lifetimePackage: Package? {
        offerings?.current?.lifetime
    }
    
    var yearlyPackage: Package? {
        offerings?.current?.annual
    }
    
    var monthlyPackage: Package? {
        offerings?.current?.monthly
    }
}

// MARK: - Delegate Extension
extension SubscriptionManager: PurchasesDelegate {
    func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        updateEntitlement(with: customerInfo)
    }
}
