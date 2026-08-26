import '../models/me_response.dart';
import 'api_client.dart';

class MeService {
  MeService(this._api);

  final ApiClient _api;

  Future<MeResponse> fetchMe() async {
    final json = await _api.getJson('/me');
    return MeResponse.fromJson(json);
  }
}
