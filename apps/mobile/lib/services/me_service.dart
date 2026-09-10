import '../debug/startup_timing.dart';
import '../models/me_response.dart';
import 'api_client.dart';

class MeService {
  MeService(this._api);

  final ApiClient _api;

  Future<MeResponse> fetchMe() async {
    StartupTiming.markSync('ME_CLIENT_REQUEST_START');
    final sw = Stopwatch()..start();
    final json = await _api.getJson('/me');
    StartupTiming.markDuration('ME_CLIENT_HTTP_TOTAL', sw.elapsedMilliseconds);
    StartupTiming.markSync('ME_CLIENT_RESPONSE_DONE');
    final parseSw = Stopwatch()..start();
    final parsed = MeResponse.fromJson(json);
    StartupTiming.markDuration(
      'ME_CLIENT_PARSE_MS',
      parseSw.elapsedMilliseconds,
    );
    StartupTiming.markSync('ME_CLIENT_PARSE_DONE');
    return parsed;
  }
}
