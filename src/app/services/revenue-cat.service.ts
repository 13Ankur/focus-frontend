import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Purchases, PurchasesPackage, LOG_LEVEL, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor';
import { RevenueCatUI } from '@revenuecat/purchases-capacitor-ui';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RevenueCatService {
  private readonly ENTITLEMENT_ID = 'StayPaws Pro';
  
  private isProSubject = new BehaviorSubject<boolean>(false);
  public isPro$: Observable<boolean> = this.isProSubject.asObservable();

  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize RevenueCat SDK
   */
  async initialize() {
    if (!Capacitor.isNativePlatform()) {
      console.log('RevenueCat: Not on a native platform, skipping initialization.');
      return;
    }

    try {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      
      const platform = Capacitor.getPlatform();
      const apiKey = platform === 'ios' 
        ? environment.revenueCatApiKey.ios 
        : environment.revenueCatApiKey.android;

      await Purchases.configure({ apiKey });
      this.isConfigured = true;
      
      // Update initial status
      await this.refreshCustomerInfo();
      
      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        this.updateProStatus(customerInfo);
      });

    } catch (error) {
      console.error('RevenueCat Initialization Error:', error);
    }
  }

  // ── User Identity Management ──

  /**
   * Link a logged-in user to RevenueCat so webhooks
   * send app_user_id = your MongoDB _id.
   * Call this immediately after login / signup / OTP verification.
   */
  async loginUser(userId: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.isConfigured) return;

    try {
      const { customerInfo } = await Purchases.logIn({ appUserID: userId });
      this.updateProStatus(customerInfo);
      console.log(`RevenueCat: Logged in as ${userId}`);
    } catch (error) {
      console.error('RevenueCat logIn error:', error);
    }
  }

  /**
   * Reset RevenueCat identity on logout so the next
   * user on this device starts fresh.
   */
  async logoutUser(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.isConfigured) return;

    try {
      const { customerInfo } = await Purchases.logOut();
      this.updateProStatus(customerInfo);
      console.log('RevenueCat: Logged out');
    } catch (error) {
      console.error('RevenueCat logOut error:', error);
    }
  }

  // ── Customer Info ──

  /**
   * Refresh customer info from RevenueCat
   */
  async refreshCustomerInfo(): Promise<any> {
    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      this.updateProStatus(customerInfo);
      return customerInfo;
    } catch (error) {
      console.error('Error fetching customer info:', error);
      return null;
    }
  }

  /**
   * Update the BehaviorSubject based on entitlements
   */
  private updateProStatus(customerInfo: any) {
    const isPro = !!customerInfo.entitlements.active[this.ENTITLEMENT_ID];
    this.isProSubject.next(isPro);
    console.log(`RevenueCat: Entitlement "${this.ENTITLEMENT_ID}" is ${isPro ? 'ACTIVE' : 'INACTIVE'}`);
  }

  // ── Offerings & Purchases ──

  /**
   * Get current offerings (products)
   */
  async getOfferings() {
    try {
      const { all } = await Purchases.getOfferings();
      return all;
    } catch (error) {
      console.error('Error getting offerings:', error);
      return null;
    }
  }

  /**
   * Get store products by their identifiers.
   * Use this for consumable products (kibble packs).
   */
  async getProducts(productIds: string[]): Promise<any[]> {
    if (!Capacitor.isNativePlatform() || !this.isConfigured) return [];

    try {
      const { products } = await Purchases.getProducts({
        productIdentifiers: productIds,
      });
      return products || [];
    } catch (error) {
      console.error('Error getting products:', error);
      return [];
    }
  }

  /**
   * Purchase a specific package (subscription)
   */
  async purchasePackage(purchasesPackage: PurchasesPackage): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.purchasePackage({
        aPackage: purchasesPackage
      });
      
      this.updateProStatus(customerInfo);
      return true;
    } catch (error: any) {
      if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        console.log('User cancelled the purchase');
      } else {
        console.error('Purchase failed:', error);
      }
      return false;
    }
  }

  /**
   * Purchase a store product by its identifier.
   * Used for consumable purchases (kibble packs).
   * Returns { success, cancelled } — the webhook handles crediting.
   */
  async purchaseProduct(productId: string): Promise<{ success: boolean; cancelled: boolean }> {
    if (!Capacitor.isNativePlatform() || !this.isConfigured) {
      return { success: false, cancelled: false };
    }

    try {
      const { products } = await Purchases.getProducts({
        productIdentifiers: [productId],
      });

      if (!products || products.length === 0) {
        console.error(`RevenueCat: Product "${productId}" not found`);
        return { success: false, cancelled: false };
      }

      await Purchases.purchaseStoreProduct({ product: products[0] });
      return { success: true, cancelled: false };
    } catch (error: any) {
      if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        console.log('User cancelled the consumable purchase');
        return { success: false, cancelled: true };
      }
      console.error('Consumable purchase failed:', error);
      return { success: false, cancelled: false };
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      this.updateProStatus(customerInfo);
      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      return false;
    }
  }

  // ── UI Presentation ──

  /**
   * Present the RevenueCat Paywall
   */
  async presentPaywall(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('RevenueCat paywall is only available on native platforms.');
      return;
    }

    try {
      const { result } = await RevenueCatUI.presentPaywall();
      console.log('Paywall result:', result);
      
      // Refresh info after paywall dismissal to be safe
      await this.refreshCustomerInfo();
    } catch (error) {
      console.error('Error presenting paywall:', error);
    }
  }

  /**
   * Present the RevenueCat Customer Center
   */
  async presentCustomerCenter(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('Customer Center is only available on native platforms.');
      return;
    }

    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (error) {
      console.error('Error presenting customer center:', error);
    }
  }

  // ── Getters ──

  /**
   * Synchronous check for Pro status
   */
  get isProSync(): boolean {
    return this.isProSubject.value;
  }

  /**
   * Whether the SDK is initialized and ready
   */
  get isReady(): boolean {
    return this.isConfigured;
  }
}
