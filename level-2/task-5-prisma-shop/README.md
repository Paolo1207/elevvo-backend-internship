# Task 5: Relational Persistence with PostgreSQL & Prisma ORM

An e-commerce API (Express + TypeScript) that replaces in-memory data with a PostgreSQL database, modelled with Prisma ORM. It uses one-to-many and many-to-many relationships, SQL migrations, pagination, relational filtering, nested writes and an atomic checkout built on `$transaction`.

## Schema

```
User 1 ──< Order 1 ──< OrderItem >── 1 Product
```

| Relationship              | Type         | How                                                         |
|---------------------------|--------------|-------------------------------------------------------------|
| User -> Order             | one-to-many  | `Order.userId` foreign key                                  |
| Order -> OrderItem        | one-to-many  | cascade delete                                              |
| Product -> OrderItem      | one-to-many  | restricted delete (a product in an order cannot be deleted) |
| Order <-> Product         | many-to-many | explicit join model `OrderItem` (quantity + unit price snapshot) |

Money uses `Decimal(10,2)`, never floats. The full schema is in `prisma/schema.prisma`, and the generated SQL is in `prisma/migrations`.

![Tables in pgAdmin](screenshots/pgadmin-tables.png)

![Migration SQL](screenshots/migration.png)

## Setup

1. Install PostgreSQL and create an empty database called `shop` (pgAdmin works).
2. Copy `.env.example` to `.env` and set your connection string:
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/shop"
   ```
3. Install, migrate, generate the client, seed and run (Node 20.19 or newer):
   ```
   npm install
   npx prisma migrate dev --name init
   npx prisma generate
   npx prisma db seed
   npm start
   ```

The server runs on http://localhost:3000. `GET /health` also reports whether the database is reachable.

## Endpoints

| Method | Path                    | Description                                                   |
|--------|-------------------------|---------------------------------------------------------------|
| GET    | /api/users              | Paginated list, `search`, `hasOrders=true`                    |
| GET    | /api/users/:id          | User with orders, items and products (3 tables joined)        |
| POST / PUT / DELETE | /api/users | Create, update, delete (delete blocked if the user has orders) |
| GET    | /api/products           | Paginated, `search`, `minPrice`, `maxPrice`, `inStock`, `sort`, `order` |
| GET / POST / PUT / DELETE | /api/products | CRUD (delete blocked if the product is in an order) |
| GET    | /api/orders             | Paginated, filter by `status`, `userId`, `productId`          |
| GET    | /api/orders/:id         | Order with user and items                                     |
| POST   | /api/orders/checkout    | Atomic checkout (see below)                                   |

## Prisma features used

- **Pagination:** `skip` and `take` from `?page=&limit=`, plus a `meta` object (`page`, `limit`, `total`, `totalPages`). The page and the total count run together in `prisma.$transaction([...])`.
- **Filtering:** `where` with `contains` (case-insensitive), price ranges (`gte`/`lte`) and **relational filters** such as `orders: { some: {} }` and `items: { some: { productId } }`.
- **Nested writes:** checkout creates the order and all its order items in a single `order.create` using `items: { create: [...] }` and `user: { connect }`.
- **Error mapping:** Prisma error codes become HTTP statuses (`P2002` -> 409 duplicate, `P2025` -> 404, `P2003` -> 409 blocked by a foreign key).

![Pagination](screenshots/pagination-200.png)

![Filter by product](screenshots/filter-200.png)

## Bonus: atomic checkout with `$transaction`

`POST /api/orders/checkout` runs inside one interactive transaction:

1. Check that the user exists.
2. For each product (sorted by id, to avoid deadlocks), run a single conditional `updateMany` that decrements stock only if `stock >= quantity`.
3. Create the order with its items (nested write).

If anything fails (unknown product, insufficient stock), the whole transaction rolls back automatically, so inventory is never deducted for an order that was not created. Because the check and the decrement are one SQL statement, stock can never go negative even with simultaneous customers.

**Successful checkout**

![Checkout 201](screenshots/checkout-201.png)

**Failed checkout: the second item has insufficient stock, so the first item's deduction is rolled back**

![Rollback 409](screenshots/rollback-409.png)

**Stock of the first product is unchanged after the rollback**

![Stock unchanged](screenshots/rollback-stock.png)

## Relational integrity

Deleting a product that appears in an order, or a user who has orders, is rejected with `409` by the foreign key constraints.

![Delete blocked](screenshots/integrity-409.png)

## Concepts covered

Relational schema design, SQL migrations, Prisma query builder, pagination and filtering, relational integrity (ACID).