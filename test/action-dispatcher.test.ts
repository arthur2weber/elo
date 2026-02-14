import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchAction } from '../src/server/action-dispatcher';
import { getDriver } from '../src/cli/utils/drivers';
import { readDevices } from '../src/cli/utils/device-registry';

// Mock the dependencies
vi.mock('../src/cli/utils/drivers');
vi.mock('../src/cli/utils/device-registry');
vi.mock('../src/drivers/http-generic');

describe('Action Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should dispatch action successfully', async () => {
    // Mock device registry
    const mockDevice = {
      id: 'test-device',
      name: 'Test Device',
      type: 'camera',
      endpoint: 'http://192.168.1.100',
      protocol: 'http',
      ip: '192.168.1.100',
      config: { timeout: 5000 }
    };

    (readDevices as any).mockResolvedValue([mockDevice]);

    // Mock driver
    const mockDriverConfig = {
      deviceName: 'Test Device',
      deviceType: 'camera',
      actions: {
        getSnapshot: {
          method: 'GET',
          url: 'http://192.168.1.100/snapshot'
        }
      }
    };

    (getDriver as any).mockResolvedValue({
      id: 'test-driver',
      device_id: 'test-device',
      config: mockDriverConfig
    });

    // Mock GenericHttpDriver
    const { GenericHttpDriver } = await import('../src/drivers/http-generic');
    const mockExecuteAction = vi.fn().mockResolvedValue({
      success: true,
      data: 'snapshot data'
    });

    vi.mocked(GenericHttpDriver).mockImplementation(() => ({
      executeAction: mockExecuteAction
    } as any));

    const result = await dispatchAction('test-device=getSnapshot');

    expect(result.success).toBe(true);
    expect((result as any).data).toBe('snapshot data');
    expect(mockExecuteAction).toHaveBeenCalledWith('getSnapshot', {
      ip: '192.168.1.100',
      config: { timeout: 5000 },
      brand: undefined,
      model: undefined,
      username: undefined,
      password: undefined
    });
  });

  it('should return error for invalid action format', async () => {
    const result = await dispatchAction('invalid-format');

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('should return error when driver not found', async () => {
    (readDevices as any).mockResolvedValue([]);
    (getDriver as any).mockResolvedValue(null);

    const result = await dispatchAction('unknown-device=testAction');

    expect(result.success).toBe(false);
    expect(result.error).toBe('driver_not_found');
  });

  it('should handle device parameters correctly', async () => {
    const mockDevice = {
      id: 'test-device',
      name: 'Test Device',
      type: 'camera',
      endpoint: 'http://192.168.1.100',
      protocol: 'http',
      ip: '192.168.1.100',
      brand: 'TestBrand',
      model: 'TestModel',
      username: 'admin',
      password: 'password123',
      config: { timeout: 5000 },
      secrets: { apiKey: 'secret' }
    };

    (readDevices as any).mockResolvedValue([mockDevice]);

    const mockDriverConfig = {
      deviceName: 'Test Device',
      deviceType: 'camera',
      actions: {
        testAction: {
          method: 'POST',
          url: 'http://192.168.1.100/test'
        }
      }
    };

    (getDriver as any).mockResolvedValue({
      id: 'test-driver',
      device_id: 'test-device',
      config: mockDriverConfig
    });

    const { GenericHttpDriver } = await import('../src/drivers/http-generic');
    const mockExecuteAction = vi.fn().mockResolvedValue({
      success: true
    });

    vi.mocked(GenericHttpDriver).mockImplementation(() => ({
      executeAction: mockExecuteAction
    } as any));

    await dispatchAction('test-device=testAction');

    expect(mockExecuteAction).toHaveBeenCalledWith('testAction', {
      ip: '192.168.1.100',
      brand: 'TestBrand',
      model: 'TestModel',
      username: 'admin',
      password: 'password123',
      config: { timeout: 5000 },
      secrets: { apiKey: 'secret' }
    });
  });
});