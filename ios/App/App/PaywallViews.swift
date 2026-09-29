import SwiftUI
import RevenueCat
import RevenueCatUI

struct PaywallViewContainer: View {
    @Environment(\.dismiss) var dismiss
    @StateObject private var subscriptionManager = SubscriptionManager.shared
    
    var body: some View {
        // This is the modern RevenueCat Paywall component
        // It automatically displays the "Current Offering" configured in the dashboard
        PaywallView(displayCloseButton: true)
            .onPurchaseCompleted { customerInfo in
                print("Purchase successful!")
                dismiss()
            }
            .onRestoreCompleted { customerInfo in
                print("Restore successful!")
            }
    }
}

struct CustomerSettingsView: View {
    var body: some View {
        NavigationView {
            // RevenueCat Customer Center allows users to manage their subscriptions directly
            CustomerCenterView()
                .navigationTitle("Subscription")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// Example of how to trigger the Paywall in your SwiftUI app
struct PremiumFeatureView: View {
    @StateObject private var subscriptionManager = SubscriptionManager.shared
    @State private var showingPaywall = false
    
    var body: some View {
        VStack(spacing: 20) {
            if subscriptionManager.isPro {
                Text("Welcome to zavvi innovations Pro! 🚀")
                    .font(.title)
                    .foregroundColor(.green)
                
                NavigationLink("Manage Subscription") {
                    CustomerSettingsView()
                }
            } else {
                Text("Unlock Premium Features")
                    .font(.headline)
                
                Button(action: {
                    showingPaywall = true
                }) {
                    Text("Upgrade to Pro")
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
            }
        }
        .sheet(isPresented: $showingPaywall) {
            PaywallViewContainer()
        }
    }
}

#Preview {
    PremiumFeatureView()
}
