# Input Doğrulama Envanteri ve Risk Önceliği

## Yüksek Risk (işlemsel/kritik veri)
- `src/components/modals/CashTransactionModal.tsx`
- `src/components/modals/CheckDetailModal.tsx`
- `src/components/modals/QuoteDetailModal.tsx`
- `src/components/modals/ContractDetailModal.tsx`
- `src/components/modals/PurchaseInvoiceDetailModal.tsx`
- `src/components/modals/StockReceiptDetailModal.tsx`

## Orta Risk (CRUD ve operasyonel veri)
- `src/components/modals/CustomerDetailModal.tsx`
- `src/components/modals/UserDetailModal.tsx`
- `src/components/modals/WarehouseDetailModal.tsx`
- `src/components/modals/InventoryDetailModal.tsx`
- `src/components/modals/PricingRuleDetailModal.tsx`
- `src/components/modals/PriceTierDetailModal.tsx`
- `src/components/modals/ManualLineItemModal.tsx`
- `src/components/modals/ProductPickerModal.tsx`
- `src/components/modals/CategoryDetailModal.tsx`
- `src/pages/LoginPage.tsx`

## Düşük Risk (arama/filtre)
- `src/pages/CustomersPage.tsx`
- `src/pages/UsersPage.tsx`
- `src/pages/InventoryPage.tsx`
- `src/pages/WarehousesPage.tsx`
- `src/pages/WarehouseDetailPage.tsx`
- `src/pages/ContractsPage.tsx`
- `src/pages/ChecksPage.tsx`
- `src/pages/CashPage.tsx`
- `src/pages/StockReceiptsPage.tsx`
- `src/pages/RentalMovementReportPage.tsx`
- `src/pages/AuditLogsPage.tsx`
- `src/layouts/MainLayout.tsx`
- `src/components/SearchableItemCombobox.tsx`
- `src/components/ItemPickerPanel.tsx`

## Uygulama Sırası
1. Yüksek riskli modallar
2. Orta riskli CRUD formlar
3. Arama/filtre normalizasyonu

## Doğrulama Standartları
- Sayısal alanlar: sadece sayı, `min/max` kontrolü ve açıklayıcı hata mesajı.
- Tarih alanları: geçerli tarih ve aralık kontrolleri.
- Kimlik formatları: UUID, IBAN, vergi no, telefon tip doğrulaması.
- Metin alanları: zorunlu alanlarda trim sonrası boşluk kontrolü.
- Hata gösterimi: form içi hata metni + API hata mesajıyla uyumlu dil.
