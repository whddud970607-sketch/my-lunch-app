import 'package:flutter/material.dart';

import '../state/auth_controller.dart';
import 'map_spike_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller});

  final AuthController controller;

  @override
  Widget build(BuildContext context) {
    final me = controller.me;
    final name = me?.displayName?.trim().isNotEmpty == true
        ? me!.displayName!
        : (me?.email ?? '기사');

    return Scaffold(
      appBar: AppBar(
        title: const Text('기사 홈'),
        actions: [
          IconButton(
            tooltip: '로그아웃',
            onPressed: () => controller.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refreshMe,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              name,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              'role: ${me?.role ?? '-'} · driver: ${me?.driver?.id ?? '-'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 24),
            Text('오늘의 배송', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  '오늘의 배송 목록은 이후 Phase에서 Nest API로 연결됩니다.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('요약', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: const [
                _StatChip(label: '총 배송', value: '—'),
                _StatChip(label: '완료', value: '—'),
                _StatChip(label: '미배송', value: '—'),
                _StatChip(label: '대기', value: '—'),
              ],
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => MapSpikeScreen(
                      apiClient: controller.apiClient,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.map_outlined),
              label: const Text('테스트 배송 지도'),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('스캔은 이후 Phase에서 구현됩니다 (placeholder)'),
                  ),
                );
              },
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('스캔 시작'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 4),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}
