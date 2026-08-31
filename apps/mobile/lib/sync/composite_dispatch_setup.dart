import '../services/api_client.dart';
import 'delivery_complete_dispatcher.dart';
import 'operation_dispatcher.dart';
import 'operation_type.dart';
import 'pod_upload_dispatcher.dart';

/// Builds Phase-2 delivery dispatchers (POD + Complete). Other types still no-op fail.
OperationDispatcher buildDeliveryDispatchers(ApiClient api) {
  return CompositeOperationDispatcher({
    OperationType.podUpload.name: PodUploadDispatcher(),
    OperationType.deliveryComplete.name: DeliveryCompleteDispatcher(api),
  });
}
