/// Shared driver-facing chrome copy. No backend/domain jargon.
abstract final class DriverChromeCopy {
  static const emptyToday = '오늘 배정된 배송이 없습니다.';
  static const searchZeroMatch = '검색 결과가 없습니다';
  static const searchZeroMatchHint = '다른 주소나 표시명으로 검색해 보세요.';
  static const searchInProgress = '검색 중';
  static const searchFailed = '검색 실패';
  static const stale = '최신 정보를 가져오지 못했습니다 · 이전 데이터 표시 중';
  static const retry = '다시 시도';
  static const refresh = '새로고침';
  static const viewOnMap = '지도에서 보기';
  static const sourceGroup = '채널';
  static const sourceVolumes = '채널별 물량';
  static const companyVolumes = '회사별 물량';
  static const loadListFailed = '배송 목록을 불러오지 못했습니다';
  static const loadMapFailed = '지도 데이터를 불러오지 못했습니다';
  static const registerByAddress = '주소로 직접 등록';
  static const manualSearchTitle = '주소 검색';
  static const manualSearchHint = '도로명 또는 지번 주소';
  static const manualSelectedAddress = '선택한 주소';
  static const manualDetailAddress = '상세주소';
  static const manualDong = '동';
  static const manualHo = '호';
  static const manualQuantity = '수량';
  static const manualRegister = '등록';
  static const manualRegistering = '등록 중';
  static const manualRegisterSuccess = '등록 성공';
  static const manualRegisterFailed = '등록 실패';
  static const manualRegisterNeedLogin = '다시 로그인한 뒤 등록해 주세요.';
  static const manualRegisterServerBusy =
      '서버 준비 중이라 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  static const manualRegisterInvalidAddress = '주소 정보가 부족해 등록하지 못했습니다.';
  static const manualRegisterMissingAddress = '선택한 주소가 비어 있습니다. 다시 검색해 주세요.';
  static const manualRegisterBadQuantity = '수량을 확인해 주세요.';
  static const manualConfirmTitle = '목적지 확인';
  static const manualRecipientName = '수령인 성함';
  static const manualRecipientPhone = '연락처';
  static const manualPinAdjust = '지도에서 위치 확인/조정';
  static const manualPinConfirm = '이 위치로 설정';
  static const manualPinHint = '단지나 동이 다르면 지도를 옮겨 핀을 맞춰 주세요.';
  static const manualInvoiceEvidenceTitle = '송장 증빙 사진';
  static const manualInvoiceEvidenceHint =
      '바코드가 인식되지 않을 경우 실제 송장을 촬영해 증빙으로 남길 수 있습니다.';
  static const manualInvoiceCapture = '송장 촬영';
  static const manualInvoiceGallery = '앨범에서 선택';
  static const manualInvoiceCaptured = '증빙 사진이 준비되었습니다';
  static const manualInvoiceRetake = '다시 촬영';
  static const manualInvoiceRemove = '삭제';
  static const manualInvoiceUploading = '증빙 업로드 중';
  static const manualInvoiceUploaded = '증빙이 저장되었습니다';
  static const manualInvoiceUploadFailed = '증빙 업로드 실패, 다시 시도할 수 있습니다';
  static const manualInvoiceRetry = '증빙 다시 업로드';
  static const manualInvoiceRejected = '증빙 사진 형식을 확인해 주세요.';
  static const manualOffline = '인터넷에 연결한 뒤 다시 시도해 주세요.';
  static const openDeliveryList = '배송 목록';
}
