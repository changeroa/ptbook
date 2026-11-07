export type Env = {
  readonly DB: D1Database;
  readonly PTBOOK_AX_KEY?: string;
  readonly PTBOOK_OPENAI_KEY?: string;
  readonly PTBOOK_ADMIN_TOKEN?: string;
  readonly PTBOOK_APP_ID?: string;
  readonly PTBOOK_OWNER_SUB?: string;
  readonly PTBOOK_HEALINE_SUB?: string;
  readonly PTBOOK_VISION_MODEL: string;
  readonly PTBOOK_DUMP_AS_OF: string;
};
