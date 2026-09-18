export type RuleId =
  | "DEK001"
  | "DEK002"
  | "DEK003"
  | "DEK004"
  | "DEK005"
  | "DEK010"
  | "DEK011"
  | "DEK012"
  | "DEK013"
  | "DEK014"
  | "DEK015"
  | "DEK020"
  | "DEK021"
  | "DEK022"
  | "DEK030"
  | "DEK031"
  | "DEK040"
  | "DEK041";

export type Diagnostic = {
  id: string;
  message: string;
  path?: string;
  line?: number;
  slug?: string;
};
