import { listAutomations } from '../utils/automation-files';

export const listAutomationsHandler = async () => {
  try {
    const automations = await listAutomations();

    if (automations.length === 0) {
      console.log('No automations found.');
      return;
    }

    console.log('List of Automations:');
    automations.forEach((automation) => {
      console.log(`- ${automation.name}`);
    });
  } catch (error) {
    console.error('Error listing automations:', (error as Error).message);
  }
};
