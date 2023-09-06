import { FiltersType } from '../../common/filter/filters';
import { CheckResult } from '../checks/types';

export interface ClientOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
  serverId?: string;
}

export interface HookResults {
  preflightCheckResults?: CheckResult[];
  okToBoot: boolean;
}
