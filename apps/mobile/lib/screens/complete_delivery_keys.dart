import 'package:flutter/material.dart';

abstract final class CompleteDeliveryKeys {
  static const header = Key('complete_point_header');
  static const counts = Key('complete_counts');
  static const quantity = Key('complete_quantity');
  static const podPhoto = Key('complete_pod_photo');
  static const podCamera = Key('complete_pod_camera');
  static const podGallery = Key('complete_pod_gallery');
  static const submit = Key('complete_submit');
  static const cancel = Key('complete_cancel');
  static const loading = Key('complete_submit_loading');
  static const error = Key('complete_error');
  static const success = Key('complete_success');
  static const offlineQueued = Key('complete_offline_queued');
  static const nextDelivery = Key('complete_next_delivery');
  static const openMap = Key('complete_open_map');
  static const openList = Key('complete_open_list');
  static const done = Key('complete_done');
}
