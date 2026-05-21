export const DEFAULT_JS_TS_ENABLED_AGENTS = {
  static_analyzer: true,
  semantic_analyzer: true,
  security_checker: true,
  testability_agent: true,
  maintainability_agent: true,
};

const OLD_AGENT_KEYS = ["code_review", "security", "tests", "maintainability"] as const;

export type EnabledAgents = {
  static_analyzer: boolean;
  semantic_analyzer: boolean;
  security_checker: boolean;
  testability_agent: boolean;
  maintainability_agent: boolean;
};

type LegacyEnabledAgents = Record<string, boolean>;

function hasAnyNewAgentKeys(value: LegacyEnabledAgents): boolean {
  return Object.prototype.hasOwnProperty.call(value, "static_analyzer")
    || Object.prototype.hasOwnProperty.call(value, "semantic_analyzer")
    || Object.prototype.hasOwnProperty.call(value, "security_checker")
    || Object.prototype.hasOwnProperty.call(value, "testability_agent")
    || Object.prototype.hasOwnProperty.call(value, "maintainability_agent");
}

export function normalizeEnabledAgents(value: unknown): EnabledAgents {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  if (hasAnyNewAgentKeys(source as EnabledAgents)) {
    return {
      static_analyzer: Boolean(source.static_analyzer),
      semantic_analyzer: Boolean(source.semantic_analyzer),
      security_checker: Boolean(source.security_checker),
      testability_agent: Boolean(source.testability_agent),
      maintainability_agent: Boolean(source.maintainability_agent),
    };
  }

  if (OLD_AGENT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
    return {
      static_analyzer: Boolean(source.code_review ?? true),
      semantic_analyzer: true,
      security_checker: Boolean(source.security ?? true),
      testability_agent: Boolean(source.tests ?? true),
      maintainability_agent: Boolean(source.maintainability ?? true),
    };
  }

  return { ...DEFAULT_JS_TS_ENABLED_AGENTS };
}