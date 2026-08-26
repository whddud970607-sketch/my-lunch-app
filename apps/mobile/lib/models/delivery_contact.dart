/// Future contact channel model (Phase 1D: types only, no provider integration).
enum DeliveryContactType { none, maskedNumber, virtualNumber }

DeliveryContactType deliveryContactTypeFromApi(String? raw) {
  switch (raw) {
    case 'masked_number':
      return DeliveryContactType.maskedNumber;
    case 'virtual_number':
      return DeliveryContactType.virtualNumber;
    case 'none':
    default:
      return DeliveryContactType.none;
  }
}
