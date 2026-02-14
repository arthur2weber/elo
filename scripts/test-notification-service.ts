#!/usr/bin/env tsx
/**
 * Test Notification Service
 * Tests the notification functionality
 */

import { initNotificationService } from '../src/server/notification-service.js';

async function testNotificationService() {
    console.log('🧪 Testing Notification Service...\n');

    try {
        // Initialize notification service (disabled for testing)
        const notificationService = initNotificationService({
            enabled: false // Disabled to avoid sending real notifications during test
        });

        console.log('1. Testing blocked action notification...');
        const blockedResult = await notificationService.send({
            title: 'Ação Bloqueada',
            message: 'Lucca tentou ligar a TV do quarto.\n\nMotivo: Dispositivo bloqueado para criança',
            priority: 'medium',
            category: 'security',
            metadata: { personName: 'Lucca', deviceId: 'tv-bedroom', action: 'turn-on' }
        });
        console.log('   Blocked action notification:', blockedResult ? 'SENT' : 'FAILED');

        console.log('2. Testing unknown person alert...');
        const unknownResult = await notificationService.send({
            title: 'Pessoa Desconhecida Detectada',
            message: 'Uma pessoa desconhecida foi detectada na câmera da sala com 85% de confiança.',
            priority: 'high',
            category: 'security',
            metadata: { cameraId: 'camera-living-room', confidence: 0.85 }
        });
        console.log('   Unknown person alert:', unknownResult ? 'SENT' : 'FAILED');

        console.log('3. Testing system error alert...');
        const errorResult = await notificationService.send({
            title: 'Erro do Sistema',
            message: 'Erro no componente face-detection-worker:\n\nConnection timeout to camera stream',
            priority: 'high',
            category: 'system',
            metadata: { error: 'Connection timeout', component: 'face-detection-worker' }
        });
        console.log('   System error alert:', errorResult ? 'SENT' : 'FAILED');

        console.log('4. Testing maintenance alert...');
        const maintenanceResult = await notificationService.send({
            title: 'Manutenção Necessária',
            message: 'Dispositivo ac-living-room precisa de atenção:\n\nFiltro precisa ser limpo\n\nRecomendação: Limpar filtro a cada 3 meses',
            priority: 'medium',
            category: 'maintenance',
            metadata: { deviceId: 'ac-living-room', issue: 'Filtro sujo', recommendation: 'Limpar filtro' }
        });
        console.log('   Maintenance alert:', maintenanceResult ? 'SENT' : 'FAILED');

        console.log('5. Testing info notification...');
        const infoResult = await notificationService.send({
            title: 'Sistema Iniciado',
            message: 'ELO Brain v2.0 foi iniciado com sucesso. Todos os serviços estão operacionais.',
            priority: 'low',
            category: 'info'
        });
        console.log('   Info notification:', infoResult ? 'SENT' : 'FAILED');

        // Get recent notifications
        console.log('6. Checking recent notifications...');
        const recent = notificationService.getRecentNotifications(10);
        console.log(`   Found ${recent.length} recent notifications`);

        console.log('\n✅ Notification Service test completed!');
        console.log('💡 Note: Notifications were not actually sent (service disabled for testing)');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run test if called directly
if (require.main === module) {
    testNotificationService();
}

export { testNotificationService };