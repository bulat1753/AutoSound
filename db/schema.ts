import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), login: text("login").notNull().unique(),
  name: text("name").notNull(), role: text("role").notNull(),
  password: text("password").notNull(), email: text("email").unique(),
  createdAt: text("created_at").notNull(), deletedAt: text("deleted_at"),
  mustChangePassword: integer("must_change_password").notNull().default(0),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});
export const authTokens = sqliteTable("auth_tokens", {
  token: text("token").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), email: text("email"), expiresAt: text("expires_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetAt: integer("reset_at").notNull(),
});
export const services = sqliteTable("services", {
  id: text("id").primaryKey(), name: text("name").notNull(), category: text("category").notNull(),
  components: integer("components").notNull().default(0), cost: integer("cost").notNull().default(0),
  labor: integer("labor").notNull().default(0), advance: integer("advance").notNull().default(0),
  archived: integer("archived").notNull().default(0),
});
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }), car: text("car").notNull(),
  description: text("description").notNull(), clientName: text("client_name").notNull().default(""),
  phone: text("phone").notNull().default(""), date: text("date").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  items: text("items").notNull(), status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id),
  amount: integer("amount").notNull(), laborAmount: integer("labor_amount").notNull(),
  method: text("method").notNull(), note: text("note").notNull().default(""),
  employeeId: text("employee_id").notNull().references(() => users.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(), shiftDate: text("shift_date").notNull(),
});
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(), createdAt: text("created_at").notNull(),
});
export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id),
  reportId: text("report_id").references(() => reports.id),
  filename: text("filename").notNull(), mime: text("mime").notNull(),
  createdAt: text("created_at").notNull(),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  startsAt: text("starts_at").notNull(), note: text("note").notNull().default(""),
  sound: text("sound").notNull().default("drops"), done: integer("done").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
