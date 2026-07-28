/**
 * @logicsrc/openprd — reference implementation of the OpenPRD standard.
 *
 * The standard is docs/openprd.md plus `openprd-prd.schema.json`; this package
 * implements it. A PRD is just a Markdown file with front-matter and eight
 * sections — it needs no service to exist, and none of this code to be valid.
 */

export { OPENPRD_VERSION, SECTIONS, STATUSES } from "./types.js";
export type * from "./types.js";

export {
  formatId,
  parsePrd,
  rewriteFrontMatter,
  slugify,
  PrdParseError
} from "./parse.js";

export {
  canTransition,
  checkTransition,
  isActive,
  nextStatuses,
  TRANSITIONS,
  type TransitionCheck
} from "./lifecycle.js";

export {
  reportFor,
  validatePrdCollection,
  validatePrdDocument,
  type ValidateOptions
} from "./validate.js";

export {
  findPrd,
  loadPrdCollection,
  nextPrdNumber,
  renderIndex,
  summarize,
  INDEX_FILE,
  TEMPLATE_FILE,
  PrdCollectionError,
  type PrdSummary
} from "./collection.js";

export {
  createPrd,
  initPrdCollection,
  writeIndex,
  TEMPLATE,
  type CreateOptions,
  type CreateResult,
  type InitResult
} from "./scaffold.js";

export {
  deriveCreatorDid,
  prdToTasks,
  validateTasks,
  type TaskDocument,
  type ToTasksOptions,
  type ToTasksResult
} from "./tasks.js";

export { renderDocument, renderReport, type ReportFormat } from "./render.js";
