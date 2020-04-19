export type SqlFieldType =
  | "BOOLEAN"
  | "VARCHAR"
  | "TEXT"
  | "JSON"
  | "CHAR"
  | "INT";

export class SqlFieldDefinition {
  constructor(
    public readonly type: SqlFieldType,
    public readonly indexed = false,
    public readonly nullable = false,
    public readonly length = 0
  ) {}
}

export class SqlNotNullableFieldDefinition extends SqlFieldDefinition {
  constructor(
    public readonly type: SqlFieldType,
    public readonly indexed = false,
    public readonly length = 0
  ) {
    super(type, indexed, false, length);
  }
}

export class SqlNullableFieldDefinition extends SqlFieldDefinition {
  constructor(
    public readonly type: SqlFieldType,
    public readonly indexed = false,
    public readonly length = 0
  ) {
    super(type, indexed, true, length);
  }
}
