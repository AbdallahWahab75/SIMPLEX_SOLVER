import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  locale: text('locale').default('fr').notNull(),
  theme: text('theme').default('light').notNull(),
  numberFormat: text('number_format').default('both').notNull(),
  decimalPrecision: integer('decimal_precision').default(4).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('projects_owner_idx').on(table.ownerId)]
);

export const folders = pgTable(
  'folders',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerId: integer('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('folders_project_idx').on(table.projectId)]
);

export const problems = pgTable(
  'problems',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    folderId: integer('folder_id').references(() => folders.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    currentVersionId: integer('current_version_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('problems_owner_idx').on(table.ownerId)]
);

export const modelVersions = pgTable(
  'model_versions',
  {
    id: serial('id').primaryKey(),
    problemId: integer('problem_id')
      .references(() => problems.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: integer('version_number').notNull(),
    createdById: integer('created_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    modelJson: jsonb('model_json').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('model_versions_problem_num_uidx').on(
      table.problemId,
      table.versionNumber
    ),
    index('model_versions_problem_idx').on(table.problemId),
  ]
);

export const resolutions = pgTable(
  'resolutions',
  {
    id: serial('id').primaryKey(),
    problemId: integer('problem_id')
      .references(() => problems.id, { onDelete: 'cascade' })
      .notNull(),
    modelVersionId: integer('model_version_id')
      .references(() => modelVersions.id, { onDelete: 'cascade' })
      .notNull(),
    requestedById: integer('requested_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull(), // queued | running | completed | failed | cancelled | timed_out | numerical_instability
    outcomeStatus: text('outcome_status'), // optimal_unique | optimal_multiple | infeasible | unbounded | invalid_model
    methodUsed: text('method_used'), // primal_simplex | two_phase_simplex | none
    engineVersion: text('engine_version').notNull(),
    durationMs: integer('duration_ms'),
    objectiveValueJson: jsonb('objective_value_json'),
    variablesJson: jsonb('variables_json'),
    constraintsJson: jsonb('constraints_json'),
    economicAnalysisAvailable: boolean('economic_analysis_available')
      .default(false)
      .notNull(),
    degeneracyDetected: boolean('degeneracy_detected').default(false).notNull(),
    blandActivated: boolean('bland_activated').default(false).notNull(),
    verificationJson: jsonb('verification_json'),
    iterationCount: integer('iteration_count').default(0).notNull(),
    internalDiagnosticsJson: jsonb('internal_diagnostics_json'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('resolutions_problem_idx').on(table.problemId),
    index('resolutions_version_idx').on(table.modelVersionId),
  ]
);

export const iterations = pgTable(
  'iterations',
  {
    id: serial('id').primaryKey(),
    resolutionId: integer('resolution_id')
      .references(() => resolutions.id, { onDelete: 'cascade' })
      .notNull(),
    iterationNumber: integer('iteration_number').notNull(),
    phase: integer('phase').notNull(),
    tableauJson: jsonb('tableau_json').notNull(),
    enteringVariable: text('entering_variable'),
    leavingVariable: text('leaving_variable'),
    pivotRow: integer('pivot_row'),
    pivotColumn: integer('pivot_column'),
    ruleUsed: text('rule_used').notNull(),
    isDegenerate: boolean('is_degenerate').default(false).notNull(),
  },
  (table) => [
    uniqueIndex('iterations_res_num_uidx').on(
      table.resolutionId,
      table.iterationNumber
    ),
    index('iterations_resolution_idx').on(table.resolutionId),
  ]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    problemId: integer('problem_id'),
    action: text('action').notNull(),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('activity_logs_user_idx').on(table.userId)]
);

export const collaborations = pgTable(
  'collaborations',
  {
    id: serial('id').primaryKey(),
    problemId: integer('problem_id')
      .references(() => problems.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(), // reader | editor | admin
    invitedById: integer('invited_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('collaborations_problem_user_uidx').on(
      table.problemId,
      table.userId
    ),
    index('collaborations_problem_idx').on(table.problemId),
    index('collaborations_user_idx').on(table.userId),
  ]
);

export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey(),
    problemId: integer('problem_id')
      .references(() => problems.id, { onDelete: 'cascade' })
      .notNull(),
    invitedById: integer('invited_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(), // reader | editor | admin
    token: text('token').notNull().unique(),
    status: text('status').default('pending').notNull(), // pending | accepted | revoked | expired
    expiresAt: timestamp('expires_at').notNull(),
    acceptedById: integer('accepted_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('invitations_problem_idx').on(table.problemId),
    index('invitations_email_idx').on(table.email),
  ]
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: serial('id').primaryKey(),
    problemId: integer('problem_id')
      .references(() => problems.id, { onDelete: 'cascade' })
      .notNull(),
    createdById: integer('created_by_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: text('token').notNull().unique(),
    role: text('role').default('reader').notNull(), // reader | editor
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('share_links_problem_idx').on(table.problemId)]
);

export const usersRelations = relations(users, ({ many, one }) => ({
  problems: many(problems),
  projects: many(projects),
  collaborations: many(collaborations),
  preferences: one(userPreferences),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  owner: one(users, {
    fields: [problems.ownerId],
    references: [users.id],
  }),
  versions: many(modelVersions),
  resolutions: many(resolutions),
  collaborations: many(collaborations),
  invitations: many(invitations),
  shareLinks: many(shareLinks),
}));

export const modelVersionsRelations = relations(
  modelVersions,
  ({ one, many }) => ({
    problem: one(problems, {
      fields: [modelVersions.problemId],
      references: [problems.id],
    }),
    resolutions: many(resolutions),
  })
);

export const resolutionsRelations = relations(
  resolutions,
  ({ one, many }) => ({
    problem: one(problems, {
      fields: [resolutions.problemId],
      references: [problems.id],
    }),
    modelVersion: one(modelVersions, {
      fields: [resolutions.modelVersionId],
      references: [modelVersions.id],
    }),
    iterations: many(iterations),
  })
);

export const iterationsRelations = relations(iterations, ({ one }) => ({
  resolution: one(resolutions, {
    fields: [iterations.resolutionId],
    references: [resolutions.id],
  }),
}));

export const collaborationsRelations = relations(collaborations, ({ one }) => ({
  problem: one(problems, {
    fields: [collaborations.problemId],
    references: [problems.id],
  }),
  user: one(users, {
    fields: [collaborations.userId],
    references: [users.id],
  }),
}));
