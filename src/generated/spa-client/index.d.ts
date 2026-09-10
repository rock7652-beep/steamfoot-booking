
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model SpaBooking
 * 
 */
export type SpaBooking = $Result.DefaultSelection<Prisma.$SpaBookingPayload>
/**
 * Model SpaBookingItem
 * 
 */
export type SpaBookingItem = $Result.DefaultSelection<Prisma.$SpaBookingItemPayload>
/**
 * Model SpaTreatment
 * 
 */
export type SpaTreatment = $Result.DefaultSelection<Prisma.$SpaTreatmentPayload>
/**
 * Model SpaSkill
 * 
 */
export type SpaSkill = $Result.DefaultSelection<Prisma.$SpaSkillPayload>
/**
 * Model SpaTreatmentSkill
 * 
 */
export type SpaTreatmentSkill = $Result.DefaultSelection<Prisma.$SpaTreatmentSkillPayload>
/**
 * Model SpaStaffSkill
 * 
 */
export type SpaStaffSkill = $Result.DefaultSelection<Prisma.$SpaStaffSkillPayload>
/**
 * Model SpaStaffAvailability
 * 
 */
export type SpaStaffAvailability = $Result.DefaultSelection<Prisma.$SpaStaffAvailabilityPayload>
/**
 * Model SpaStaffAvailabilityException
 * 
 */
export type SpaStaffAvailabilityException = $Result.DefaultSelection<Prisma.$SpaStaffAvailabilityExceptionPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const SpaBookingStatus: {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
};

export type SpaBookingStatus = (typeof SpaBookingStatus)[keyof typeof SpaBookingStatus]


export const SpaAvailabilityExceptionType: {
  UNAVAILABLE: 'UNAVAILABLE',
  AVAILABLE: 'AVAILABLE'
};

export type SpaAvailabilityExceptionType = (typeof SpaAvailabilityExceptionType)[keyof typeof SpaAvailabilityExceptionType]

}

export type SpaBookingStatus = $Enums.SpaBookingStatus

export const SpaBookingStatus: typeof $Enums.SpaBookingStatus

export type SpaAvailabilityExceptionType = $Enums.SpaAvailabilityExceptionType

export const SpaAvailabilityExceptionType: typeof $Enums.SpaAvailabilityExceptionType

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more SpaBookings
 * const spaBookings = await prisma.spaBooking.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more SpaBookings
   * const spaBookings = await prisma.spaBooking.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.spaBooking`: Exposes CRUD operations for the **SpaBooking** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaBookings
    * const spaBookings = await prisma.spaBooking.findMany()
    * ```
    */
  get spaBooking(): Prisma.SpaBookingDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaBookingItem`: Exposes CRUD operations for the **SpaBookingItem** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaBookingItems
    * const spaBookingItems = await prisma.spaBookingItem.findMany()
    * ```
    */
  get spaBookingItem(): Prisma.SpaBookingItemDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaTreatment`: Exposes CRUD operations for the **SpaTreatment** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaTreatments
    * const spaTreatments = await prisma.spaTreatment.findMany()
    * ```
    */
  get spaTreatment(): Prisma.SpaTreatmentDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaSkill`: Exposes CRUD operations for the **SpaSkill** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaSkills
    * const spaSkills = await prisma.spaSkill.findMany()
    * ```
    */
  get spaSkill(): Prisma.SpaSkillDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaTreatmentSkill`: Exposes CRUD operations for the **SpaTreatmentSkill** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaTreatmentSkills
    * const spaTreatmentSkills = await prisma.spaTreatmentSkill.findMany()
    * ```
    */
  get spaTreatmentSkill(): Prisma.SpaTreatmentSkillDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaStaffSkill`: Exposes CRUD operations for the **SpaStaffSkill** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaStaffSkills
    * const spaStaffSkills = await prisma.spaStaffSkill.findMany()
    * ```
    */
  get spaStaffSkill(): Prisma.SpaStaffSkillDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaStaffAvailability`: Exposes CRUD operations for the **SpaStaffAvailability** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaStaffAvailabilities
    * const spaStaffAvailabilities = await prisma.spaStaffAvailability.findMany()
    * ```
    */
  get spaStaffAvailability(): Prisma.SpaStaffAvailabilityDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.spaStaffAvailabilityException`: Exposes CRUD operations for the **SpaStaffAvailabilityException** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SpaStaffAvailabilityExceptions
    * const spaStaffAvailabilityExceptions = await prisma.spaStaffAvailabilityException.findMany()
    * ```
    */
  get spaStaffAvailabilityException(): Prisma.SpaStaffAvailabilityExceptionDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.2
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    SpaBooking: 'SpaBooking',
    SpaBookingItem: 'SpaBookingItem',
    SpaTreatment: 'SpaTreatment',
    SpaSkill: 'SpaSkill',
    SpaTreatmentSkill: 'SpaTreatmentSkill',
    SpaStaffSkill: 'SpaStaffSkill',
    SpaStaffAvailability: 'SpaStaffAvailability',
    SpaStaffAvailabilityException: 'SpaStaffAvailabilityException'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "spaBooking" | "spaBookingItem" | "spaTreatment" | "spaSkill" | "spaTreatmentSkill" | "spaStaffSkill" | "spaStaffAvailability" | "spaStaffAvailabilityException"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      SpaBooking: {
        payload: Prisma.$SpaBookingPayload<ExtArgs>
        fields: Prisma.SpaBookingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaBookingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaBookingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          findFirst: {
            args: Prisma.SpaBookingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaBookingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          findMany: {
            args: Prisma.SpaBookingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>[]
          }
          create: {
            args: Prisma.SpaBookingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          createMany: {
            args: Prisma.SpaBookingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaBookingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>[]
          }
          delete: {
            args: Prisma.SpaBookingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          update: {
            args: Prisma.SpaBookingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          deleteMany: {
            args: Prisma.SpaBookingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaBookingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaBookingUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>[]
          }
          upsert: {
            args: Prisma.SpaBookingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingPayload>
          }
          aggregate: {
            args: Prisma.SpaBookingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaBooking>
          }
          groupBy: {
            args: Prisma.SpaBookingGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaBookingGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaBookingCountArgs<ExtArgs>
            result: $Utils.Optional<SpaBookingCountAggregateOutputType> | number
          }
        }
      }
      SpaBookingItem: {
        payload: Prisma.$SpaBookingItemPayload<ExtArgs>
        fields: Prisma.SpaBookingItemFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaBookingItemFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaBookingItemFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          findFirst: {
            args: Prisma.SpaBookingItemFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaBookingItemFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          findMany: {
            args: Prisma.SpaBookingItemFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>[]
          }
          create: {
            args: Prisma.SpaBookingItemCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          createMany: {
            args: Prisma.SpaBookingItemCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaBookingItemCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>[]
          }
          delete: {
            args: Prisma.SpaBookingItemDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          update: {
            args: Prisma.SpaBookingItemUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          deleteMany: {
            args: Prisma.SpaBookingItemDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaBookingItemUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaBookingItemUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>[]
          }
          upsert: {
            args: Prisma.SpaBookingItemUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaBookingItemPayload>
          }
          aggregate: {
            args: Prisma.SpaBookingItemAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaBookingItem>
          }
          groupBy: {
            args: Prisma.SpaBookingItemGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaBookingItemGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaBookingItemCountArgs<ExtArgs>
            result: $Utils.Optional<SpaBookingItemCountAggregateOutputType> | number
          }
        }
      }
      SpaTreatment: {
        payload: Prisma.$SpaTreatmentPayload<ExtArgs>
        fields: Prisma.SpaTreatmentFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaTreatmentFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaTreatmentFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          findFirst: {
            args: Prisma.SpaTreatmentFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaTreatmentFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          findMany: {
            args: Prisma.SpaTreatmentFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>[]
          }
          create: {
            args: Prisma.SpaTreatmentCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          createMany: {
            args: Prisma.SpaTreatmentCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaTreatmentCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>[]
          }
          delete: {
            args: Prisma.SpaTreatmentDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          update: {
            args: Prisma.SpaTreatmentUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          deleteMany: {
            args: Prisma.SpaTreatmentDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaTreatmentUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaTreatmentUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>[]
          }
          upsert: {
            args: Prisma.SpaTreatmentUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentPayload>
          }
          aggregate: {
            args: Prisma.SpaTreatmentAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaTreatment>
          }
          groupBy: {
            args: Prisma.SpaTreatmentGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaTreatmentGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaTreatmentCountArgs<ExtArgs>
            result: $Utils.Optional<SpaTreatmentCountAggregateOutputType> | number
          }
        }
      }
      SpaSkill: {
        payload: Prisma.$SpaSkillPayload<ExtArgs>
        fields: Prisma.SpaSkillFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaSkillFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaSkillFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          findFirst: {
            args: Prisma.SpaSkillFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaSkillFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          findMany: {
            args: Prisma.SpaSkillFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>[]
          }
          create: {
            args: Prisma.SpaSkillCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          createMany: {
            args: Prisma.SpaSkillCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaSkillCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>[]
          }
          delete: {
            args: Prisma.SpaSkillDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          update: {
            args: Prisma.SpaSkillUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          deleteMany: {
            args: Prisma.SpaSkillDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaSkillUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaSkillUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>[]
          }
          upsert: {
            args: Prisma.SpaSkillUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaSkillPayload>
          }
          aggregate: {
            args: Prisma.SpaSkillAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaSkill>
          }
          groupBy: {
            args: Prisma.SpaSkillGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaSkillGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaSkillCountArgs<ExtArgs>
            result: $Utils.Optional<SpaSkillCountAggregateOutputType> | number
          }
        }
      }
      SpaTreatmentSkill: {
        payload: Prisma.$SpaTreatmentSkillPayload<ExtArgs>
        fields: Prisma.SpaTreatmentSkillFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaTreatmentSkillFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaTreatmentSkillFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          findFirst: {
            args: Prisma.SpaTreatmentSkillFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaTreatmentSkillFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          findMany: {
            args: Prisma.SpaTreatmentSkillFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>[]
          }
          create: {
            args: Prisma.SpaTreatmentSkillCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          createMany: {
            args: Prisma.SpaTreatmentSkillCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaTreatmentSkillCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>[]
          }
          delete: {
            args: Prisma.SpaTreatmentSkillDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          update: {
            args: Prisma.SpaTreatmentSkillUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          deleteMany: {
            args: Prisma.SpaTreatmentSkillDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaTreatmentSkillUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaTreatmentSkillUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>[]
          }
          upsert: {
            args: Prisma.SpaTreatmentSkillUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaTreatmentSkillPayload>
          }
          aggregate: {
            args: Prisma.SpaTreatmentSkillAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaTreatmentSkill>
          }
          groupBy: {
            args: Prisma.SpaTreatmentSkillGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaTreatmentSkillGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaTreatmentSkillCountArgs<ExtArgs>
            result: $Utils.Optional<SpaTreatmentSkillCountAggregateOutputType> | number
          }
        }
      }
      SpaStaffSkill: {
        payload: Prisma.$SpaStaffSkillPayload<ExtArgs>
        fields: Prisma.SpaStaffSkillFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaStaffSkillFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaStaffSkillFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          findFirst: {
            args: Prisma.SpaStaffSkillFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaStaffSkillFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          findMany: {
            args: Prisma.SpaStaffSkillFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>[]
          }
          create: {
            args: Prisma.SpaStaffSkillCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          createMany: {
            args: Prisma.SpaStaffSkillCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaStaffSkillCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>[]
          }
          delete: {
            args: Prisma.SpaStaffSkillDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          update: {
            args: Prisma.SpaStaffSkillUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          deleteMany: {
            args: Prisma.SpaStaffSkillDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaStaffSkillUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaStaffSkillUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>[]
          }
          upsert: {
            args: Prisma.SpaStaffSkillUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffSkillPayload>
          }
          aggregate: {
            args: Prisma.SpaStaffSkillAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaStaffSkill>
          }
          groupBy: {
            args: Prisma.SpaStaffSkillGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffSkillGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaStaffSkillCountArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffSkillCountAggregateOutputType> | number
          }
        }
      }
      SpaStaffAvailability: {
        payload: Prisma.$SpaStaffAvailabilityPayload<ExtArgs>
        fields: Prisma.SpaStaffAvailabilityFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaStaffAvailabilityFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaStaffAvailabilityFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          findFirst: {
            args: Prisma.SpaStaffAvailabilityFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaStaffAvailabilityFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          findMany: {
            args: Prisma.SpaStaffAvailabilityFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>[]
          }
          create: {
            args: Prisma.SpaStaffAvailabilityCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          createMany: {
            args: Prisma.SpaStaffAvailabilityCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaStaffAvailabilityCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>[]
          }
          delete: {
            args: Prisma.SpaStaffAvailabilityDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          update: {
            args: Prisma.SpaStaffAvailabilityUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          deleteMany: {
            args: Prisma.SpaStaffAvailabilityDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaStaffAvailabilityUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaStaffAvailabilityUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>[]
          }
          upsert: {
            args: Prisma.SpaStaffAvailabilityUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityPayload>
          }
          aggregate: {
            args: Prisma.SpaStaffAvailabilityAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaStaffAvailability>
          }
          groupBy: {
            args: Prisma.SpaStaffAvailabilityGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffAvailabilityGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaStaffAvailabilityCountArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffAvailabilityCountAggregateOutputType> | number
          }
        }
      }
      SpaStaffAvailabilityException: {
        payload: Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>
        fields: Prisma.SpaStaffAvailabilityExceptionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SpaStaffAvailabilityExceptionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SpaStaffAvailabilityExceptionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          findFirst: {
            args: Prisma.SpaStaffAvailabilityExceptionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SpaStaffAvailabilityExceptionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          findMany: {
            args: Prisma.SpaStaffAvailabilityExceptionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>[]
          }
          create: {
            args: Prisma.SpaStaffAvailabilityExceptionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          createMany: {
            args: Prisma.SpaStaffAvailabilityExceptionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SpaStaffAvailabilityExceptionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>[]
          }
          delete: {
            args: Prisma.SpaStaffAvailabilityExceptionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          update: {
            args: Prisma.SpaStaffAvailabilityExceptionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          deleteMany: {
            args: Prisma.SpaStaffAvailabilityExceptionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SpaStaffAvailabilityExceptionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SpaStaffAvailabilityExceptionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>[]
          }
          upsert: {
            args: Prisma.SpaStaffAvailabilityExceptionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SpaStaffAvailabilityExceptionPayload>
          }
          aggregate: {
            args: Prisma.SpaStaffAvailabilityExceptionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSpaStaffAvailabilityException>
          }
          groupBy: {
            args: Prisma.SpaStaffAvailabilityExceptionGroupByArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffAvailabilityExceptionGroupByOutputType>[]
          }
          count: {
            args: Prisma.SpaStaffAvailabilityExceptionCountArgs<ExtArgs>
            result: $Utils.Optional<SpaStaffAvailabilityExceptionCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    spaBooking?: SpaBookingOmit
    spaBookingItem?: SpaBookingItemOmit
    spaTreatment?: SpaTreatmentOmit
    spaSkill?: SpaSkillOmit
    spaTreatmentSkill?: SpaTreatmentSkillOmit
    spaStaffSkill?: SpaStaffSkillOmit
    spaStaffAvailability?: SpaStaffAvailabilityOmit
    spaStaffAvailabilityException?: SpaStaffAvailabilityExceptionOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type SpaBookingCountOutputType
   */

  export type SpaBookingCountOutputType = {
    items: number
  }

  export type SpaBookingCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    items?: boolean | SpaBookingCountOutputTypeCountItemsArgs
  }

  // Custom InputTypes
  /**
   * SpaBookingCountOutputType without action
   */
  export type SpaBookingCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingCountOutputType
     */
    select?: SpaBookingCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SpaBookingCountOutputType without action
   */
  export type SpaBookingCountOutputTypeCountItemsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaBookingItemWhereInput
  }


  /**
   * Count Type SpaTreatmentCountOutputType
   */

  export type SpaTreatmentCountOutputType = {
    skills: number
  }

  export type SpaTreatmentCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    skills?: boolean | SpaTreatmentCountOutputTypeCountSkillsArgs
  }

  // Custom InputTypes
  /**
   * SpaTreatmentCountOutputType without action
   */
  export type SpaTreatmentCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentCountOutputType
     */
    select?: SpaTreatmentCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SpaTreatmentCountOutputType without action
   */
  export type SpaTreatmentCountOutputTypeCountSkillsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaTreatmentSkillWhereInput
  }


  /**
   * Count Type SpaSkillCountOutputType
   */

  export type SpaSkillCountOutputType = {
    treatments: number
    staff: number
  }

  export type SpaSkillCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    treatments?: boolean | SpaSkillCountOutputTypeCountTreatmentsArgs
    staff?: boolean | SpaSkillCountOutputTypeCountStaffArgs
  }

  // Custom InputTypes
  /**
   * SpaSkillCountOutputType without action
   */
  export type SpaSkillCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkillCountOutputType
     */
    select?: SpaSkillCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SpaSkillCountOutputType without action
   */
  export type SpaSkillCountOutputTypeCountTreatmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaTreatmentSkillWhereInput
  }

  /**
   * SpaSkillCountOutputType without action
   */
  export type SpaSkillCountOutputTypeCountStaffArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaStaffSkillWhereInput
  }


  /**
   * Models
   */

  /**
   * Model SpaBooking
   */

  export type AggregateSpaBooking = {
    _count: SpaBookingCountAggregateOutputType | null
    _avg: SpaBookingAvgAggregateOutputType | null
    _sum: SpaBookingSumAggregateOutputType | null
    _min: SpaBookingMinAggregateOutputType | null
    _max: SpaBookingMaxAggregateOutputType | null
  }

  export type SpaBookingAvgAggregateOutputType = {
    totalPriceSnapshot: Decimal | null
  }

  export type SpaBookingSumAggregateOutputType = {
    totalPriceSnapshot: Decimal | null
  }

  export type SpaBookingMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    customerId: string | null
    serviceStaffId: string | null
    bookingDate: Date | null
    startTime: string | null
    endTime: string | null
    status: $Enums.SpaBookingStatus | null
    serviceNameSnapshot: string | null
    totalPriceSnapshot: Decimal | null
    requestKey: string | null
    notes: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SpaBookingMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    customerId: string | null
    serviceStaffId: string | null
    bookingDate: Date | null
    startTime: string | null
    endTime: string | null
    status: $Enums.SpaBookingStatus | null
    serviceNameSnapshot: string | null
    totalPriceSnapshot: Decimal | null
    requestKey: string | null
    notes: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SpaBookingCountAggregateOutputType = {
    id: number
    storeId: number
    customerId: number
    serviceStaffId: number
    bookingDate: number
    startTime: number
    endTime: number
    status: number
    serviceNameSnapshot: number
    totalPriceSnapshot: number
    requestKey: number
    notes: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SpaBookingAvgAggregateInputType = {
    totalPriceSnapshot?: true
  }

  export type SpaBookingSumAggregateInputType = {
    totalPriceSnapshot?: true
  }

  export type SpaBookingMinAggregateInputType = {
    id?: true
    storeId?: true
    customerId?: true
    serviceStaffId?: true
    bookingDate?: true
    startTime?: true
    endTime?: true
    status?: true
    serviceNameSnapshot?: true
    totalPriceSnapshot?: true
    requestKey?: true
    notes?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SpaBookingMaxAggregateInputType = {
    id?: true
    storeId?: true
    customerId?: true
    serviceStaffId?: true
    bookingDate?: true
    startTime?: true
    endTime?: true
    status?: true
    serviceNameSnapshot?: true
    totalPriceSnapshot?: true
    requestKey?: true
    notes?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SpaBookingCountAggregateInputType = {
    id?: true
    storeId?: true
    customerId?: true
    serviceStaffId?: true
    bookingDate?: true
    startTime?: true
    endTime?: true
    status?: true
    serviceNameSnapshot?: true
    totalPriceSnapshot?: true
    requestKey?: true
    notes?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SpaBookingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaBooking to aggregate.
     */
    where?: SpaBookingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookings to fetch.
     */
    orderBy?: SpaBookingOrderByWithRelationInput | SpaBookingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaBookingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaBookings
    **/
    _count?: true | SpaBookingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SpaBookingAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SpaBookingSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaBookingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaBookingMaxAggregateInputType
  }

  export type GetSpaBookingAggregateType<T extends SpaBookingAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaBooking]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaBooking[P]>
      : GetScalarType<T[P], AggregateSpaBooking[P]>
  }




  export type SpaBookingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaBookingWhereInput
    orderBy?: SpaBookingOrderByWithAggregationInput | SpaBookingOrderByWithAggregationInput[]
    by: SpaBookingScalarFieldEnum[] | SpaBookingScalarFieldEnum
    having?: SpaBookingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaBookingCountAggregateInputType | true
    _avg?: SpaBookingAvgAggregateInputType
    _sum?: SpaBookingSumAggregateInputType
    _min?: SpaBookingMinAggregateInputType
    _max?: SpaBookingMaxAggregateInputType
  }

  export type SpaBookingGroupByOutputType = {
    id: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date
    startTime: string
    endTime: string
    status: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal
    requestKey: string | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
    _count: SpaBookingCountAggregateOutputType | null
    _avg: SpaBookingAvgAggregateOutputType | null
    _sum: SpaBookingSumAggregateOutputType | null
    _min: SpaBookingMinAggregateOutputType | null
    _max: SpaBookingMaxAggregateOutputType | null
  }

  type GetSpaBookingGroupByPayload<T extends SpaBookingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaBookingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaBookingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaBookingGroupByOutputType[P]>
            : GetScalarType<T[P], SpaBookingGroupByOutputType[P]>
        }
      >
    >


  export type SpaBookingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    customerId?: boolean
    serviceStaffId?: boolean
    bookingDate?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    serviceNameSnapshot?: boolean
    totalPriceSnapshot?: boolean
    requestKey?: boolean
    notes?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    items?: boolean | SpaBooking$itemsArgs<ExtArgs>
    _count?: boolean | SpaBookingCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaBooking"]>

  export type SpaBookingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    customerId?: boolean
    serviceStaffId?: boolean
    bookingDate?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    serviceNameSnapshot?: boolean
    totalPriceSnapshot?: boolean
    requestKey?: boolean
    notes?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["spaBooking"]>

  export type SpaBookingSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    customerId?: boolean
    serviceStaffId?: boolean
    bookingDate?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    serviceNameSnapshot?: boolean
    totalPriceSnapshot?: boolean
    requestKey?: boolean
    notes?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["spaBooking"]>

  export type SpaBookingSelectScalar = {
    id?: boolean
    storeId?: boolean
    customerId?: boolean
    serviceStaffId?: boolean
    bookingDate?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    serviceNameSnapshot?: boolean
    totalPriceSnapshot?: boolean
    requestKey?: boolean
    notes?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SpaBookingOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "customerId" | "serviceStaffId" | "bookingDate" | "startTime" | "endTime" | "status" | "serviceNameSnapshot" | "totalPriceSnapshot" | "requestKey" | "notes" | "createdAt" | "updatedAt", ExtArgs["result"]["spaBooking"]>
  export type SpaBookingInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    items?: boolean | SpaBooking$itemsArgs<ExtArgs>
    _count?: boolean | SpaBookingCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SpaBookingIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SpaBookingIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SpaBookingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaBooking"
    objects: {
      items: Prisma.$SpaBookingItemPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      customerId: string
      serviceStaffId: string
      bookingDate: Date
      startTime: string
      endTime: string
      status: $Enums.SpaBookingStatus
      serviceNameSnapshot: string
      totalPriceSnapshot: Prisma.Decimal
      requestKey: string | null
      notes: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["spaBooking"]>
    composites: {}
  }

  type SpaBookingGetPayload<S extends boolean | null | undefined | SpaBookingDefaultArgs> = $Result.GetResult<Prisma.$SpaBookingPayload, S>

  type SpaBookingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaBookingFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaBookingCountAggregateInputType | true
    }

  export interface SpaBookingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaBooking'], meta: { name: 'SpaBooking' } }
    /**
     * Find zero or one SpaBooking that matches the filter.
     * @param {SpaBookingFindUniqueArgs} args - Arguments to find a SpaBooking
     * @example
     * // Get one SpaBooking
     * const spaBooking = await prisma.spaBooking.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaBookingFindUniqueArgs>(args: SelectSubset<T, SpaBookingFindUniqueArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaBooking that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaBookingFindUniqueOrThrowArgs} args - Arguments to find a SpaBooking
     * @example
     * // Get one SpaBooking
     * const spaBooking = await prisma.spaBooking.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaBookingFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaBookingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaBooking that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingFindFirstArgs} args - Arguments to find a SpaBooking
     * @example
     * // Get one SpaBooking
     * const spaBooking = await prisma.spaBooking.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaBookingFindFirstArgs>(args?: SelectSubset<T, SpaBookingFindFirstArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaBooking that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingFindFirstOrThrowArgs} args - Arguments to find a SpaBooking
     * @example
     * // Get one SpaBooking
     * const spaBooking = await prisma.spaBooking.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaBookingFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaBookingFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaBookings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaBookings
     * const spaBookings = await prisma.spaBooking.findMany()
     * 
     * // Get first 10 SpaBookings
     * const spaBookings = await prisma.spaBooking.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaBookingWithIdOnly = await prisma.spaBooking.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaBookingFindManyArgs>(args?: SelectSubset<T, SpaBookingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaBooking.
     * @param {SpaBookingCreateArgs} args - Arguments to create a SpaBooking.
     * @example
     * // Create one SpaBooking
     * const SpaBooking = await prisma.spaBooking.create({
     *   data: {
     *     // ... data to create a SpaBooking
     *   }
     * })
     * 
     */
    create<T extends SpaBookingCreateArgs>(args: SelectSubset<T, SpaBookingCreateArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaBookings.
     * @param {SpaBookingCreateManyArgs} args - Arguments to create many SpaBookings.
     * @example
     * // Create many SpaBookings
     * const spaBooking = await prisma.spaBooking.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaBookingCreateManyArgs>(args?: SelectSubset<T, SpaBookingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaBookings and returns the data saved in the database.
     * @param {SpaBookingCreateManyAndReturnArgs} args - Arguments to create many SpaBookings.
     * @example
     * // Create many SpaBookings
     * const spaBooking = await prisma.spaBooking.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaBookings and only return the `id`
     * const spaBookingWithIdOnly = await prisma.spaBooking.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaBookingCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaBookingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaBooking.
     * @param {SpaBookingDeleteArgs} args - Arguments to delete one SpaBooking.
     * @example
     * // Delete one SpaBooking
     * const SpaBooking = await prisma.spaBooking.delete({
     *   where: {
     *     // ... filter to delete one SpaBooking
     *   }
     * })
     * 
     */
    delete<T extends SpaBookingDeleteArgs>(args: SelectSubset<T, SpaBookingDeleteArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaBooking.
     * @param {SpaBookingUpdateArgs} args - Arguments to update one SpaBooking.
     * @example
     * // Update one SpaBooking
     * const spaBooking = await prisma.spaBooking.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaBookingUpdateArgs>(args: SelectSubset<T, SpaBookingUpdateArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaBookings.
     * @param {SpaBookingDeleteManyArgs} args - Arguments to filter SpaBookings to delete.
     * @example
     * // Delete a few SpaBookings
     * const { count } = await prisma.spaBooking.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaBookingDeleteManyArgs>(args?: SelectSubset<T, SpaBookingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaBookings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaBookings
     * const spaBooking = await prisma.spaBooking.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaBookingUpdateManyArgs>(args: SelectSubset<T, SpaBookingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaBookings and returns the data updated in the database.
     * @param {SpaBookingUpdateManyAndReturnArgs} args - Arguments to update many SpaBookings.
     * @example
     * // Update many SpaBookings
     * const spaBooking = await prisma.spaBooking.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaBookings and only return the `id`
     * const spaBookingWithIdOnly = await prisma.spaBooking.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaBookingUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaBookingUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaBooking.
     * @param {SpaBookingUpsertArgs} args - Arguments to update or create a SpaBooking.
     * @example
     * // Update or create a SpaBooking
     * const spaBooking = await prisma.spaBooking.upsert({
     *   create: {
     *     // ... data to create a SpaBooking
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaBooking we want to update
     *   }
     * })
     */
    upsert<T extends SpaBookingUpsertArgs>(args: SelectSubset<T, SpaBookingUpsertArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaBookings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingCountArgs} args - Arguments to filter SpaBookings to count.
     * @example
     * // Count the number of SpaBookings
     * const count = await prisma.spaBooking.count({
     *   where: {
     *     // ... the filter for the SpaBookings we want to count
     *   }
     * })
    **/
    count<T extends SpaBookingCountArgs>(
      args?: Subset<T, SpaBookingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaBookingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaBooking.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaBookingAggregateArgs>(args: Subset<T, SpaBookingAggregateArgs>): Prisma.PrismaPromise<GetSpaBookingAggregateType<T>>

    /**
     * Group by SpaBooking.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaBookingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaBookingGroupByArgs['orderBy'] }
        : { orderBy?: SpaBookingGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaBookingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaBookingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaBooking model
   */
  readonly fields: SpaBookingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaBooking.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaBookingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    items<T extends SpaBooking$itemsArgs<ExtArgs> = {}>(args?: Subset<T, SpaBooking$itemsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaBooking model
   */
  interface SpaBookingFieldRefs {
    readonly id: FieldRef<"SpaBooking", 'String'>
    readonly storeId: FieldRef<"SpaBooking", 'String'>
    readonly customerId: FieldRef<"SpaBooking", 'String'>
    readonly serviceStaffId: FieldRef<"SpaBooking", 'String'>
    readonly bookingDate: FieldRef<"SpaBooking", 'DateTime'>
    readonly startTime: FieldRef<"SpaBooking", 'String'>
    readonly endTime: FieldRef<"SpaBooking", 'String'>
    readonly status: FieldRef<"SpaBooking", 'SpaBookingStatus'>
    readonly serviceNameSnapshot: FieldRef<"SpaBooking", 'String'>
    readonly totalPriceSnapshot: FieldRef<"SpaBooking", 'Decimal'>
    readonly requestKey: FieldRef<"SpaBooking", 'String'>
    readonly notes: FieldRef<"SpaBooking", 'String'>
    readonly createdAt: FieldRef<"SpaBooking", 'DateTime'>
    readonly updatedAt: FieldRef<"SpaBooking", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SpaBooking findUnique
   */
  export type SpaBookingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter, which SpaBooking to fetch.
     */
    where: SpaBookingWhereUniqueInput
  }

  /**
   * SpaBooking findUniqueOrThrow
   */
  export type SpaBookingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter, which SpaBooking to fetch.
     */
    where: SpaBookingWhereUniqueInput
  }

  /**
   * SpaBooking findFirst
   */
  export type SpaBookingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter, which SpaBooking to fetch.
     */
    where?: SpaBookingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookings to fetch.
     */
    orderBy?: SpaBookingOrderByWithRelationInput | SpaBookingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaBookings.
     */
    cursor?: SpaBookingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaBookings.
     */
    distinct?: SpaBookingScalarFieldEnum | SpaBookingScalarFieldEnum[]
  }

  /**
   * SpaBooking findFirstOrThrow
   */
  export type SpaBookingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter, which SpaBooking to fetch.
     */
    where?: SpaBookingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookings to fetch.
     */
    orderBy?: SpaBookingOrderByWithRelationInput | SpaBookingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaBookings.
     */
    cursor?: SpaBookingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaBookings.
     */
    distinct?: SpaBookingScalarFieldEnum | SpaBookingScalarFieldEnum[]
  }

  /**
   * SpaBooking findMany
   */
  export type SpaBookingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookings to fetch.
     */
    where?: SpaBookingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookings to fetch.
     */
    orderBy?: SpaBookingOrderByWithRelationInput | SpaBookingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaBookings.
     */
    cursor?: SpaBookingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookings.
     */
    skip?: number
    distinct?: SpaBookingScalarFieldEnum | SpaBookingScalarFieldEnum[]
  }

  /**
   * SpaBooking create
   */
  export type SpaBookingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaBooking.
     */
    data: XOR<SpaBookingCreateInput, SpaBookingUncheckedCreateInput>
  }

  /**
   * SpaBooking createMany
   */
  export type SpaBookingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaBookings.
     */
    data: SpaBookingCreateManyInput | SpaBookingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaBooking createManyAndReturn
   */
  export type SpaBookingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * The data used to create many SpaBookings.
     */
    data: SpaBookingCreateManyInput | SpaBookingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaBooking update
   */
  export type SpaBookingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaBooking.
     */
    data: XOR<SpaBookingUpdateInput, SpaBookingUncheckedUpdateInput>
    /**
     * Choose, which SpaBooking to update.
     */
    where: SpaBookingWhereUniqueInput
  }

  /**
   * SpaBooking updateMany
   */
  export type SpaBookingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaBookings.
     */
    data: XOR<SpaBookingUpdateManyMutationInput, SpaBookingUncheckedUpdateManyInput>
    /**
     * Filter which SpaBookings to update
     */
    where?: SpaBookingWhereInput
    /**
     * Limit how many SpaBookings to update.
     */
    limit?: number
  }

  /**
   * SpaBooking updateManyAndReturn
   */
  export type SpaBookingUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * The data used to update SpaBookings.
     */
    data: XOR<SpaBookingUpdateManyMutationInput, SpaBookingUncheckedUpdateManyInput>
    /**
     * Filter which SpaBookings to update
     */
    where?: SpaBookingWhereInput
    /**
     * Limit how many SpaBookings to update.
     */
    limit?: number
  }

  /**
   * SpaBooking upsert
   */
  export type SpaBookingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaBooking to update in case it exists.
     */
    where: SpaBookingWhereUniqueInput
    /**
     * In case the SpaBooking found by the `where` argument doesn't exist, create a new SpaBooking with this data.
     */
    create: XOR<SpaBookingCreateInput, SpaBookingUncheckedCreateInput>
    /**
     * In case the SpaBooking was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaBookingUpdateInput, SpaBookingUncheckedUpdateInput>
  }

  /**
   * SpaBooking delete
   */
  export type SpaBookingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
    /**
     * Filter which SpaBooking to delete.
     */
    where: SpaBookingWhereUniqueInput
  }

  /**
   * SpaBooking deleteMany
   */
  export type SpaBookingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaBookings to delete
     */
    where?: SpaBookingWhereInput
    /**
     * Limit how many SpaBookings to delete.
     */
    limit?: number
  }

  /**
   * SpaBooking.items
   */
  export type SpaBooking$itemsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    where?: SpaBookingItemWhereInput
    orderBy?: SpaBookingItemOrderByWithRelationInput | SpaBookingItemOrderByWithRelationInput[]
    cursor?: SpaBookingItemWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SpaBookingItemScalarFieldEnum | SpaBookingItemScalarFieldEnum[]
  }

  /**
   * SpaBooking without action
   */
  export type SpaBookingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBooking
     */
    select?: SpaBookingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBooking
     */
    omit?: SpaBookingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingInclude<ExtArgs> | null
  }


  /**
   * Model SpaBookingItem
   */

  export type AggregateSpaBookingItem = {
    _count: SpaBookingItemCountAggregateOutputType | null
    _avg: SpaBookingItemAvgAggregateOutputType | null
    _sum: SpaBookingItemSumAggregateOutputType | null
    _min: SpaBookingItemMinAggregateOutputType | null
    _max: SpaBookingItemMaxAggregateOutputType | null
  }

  export type SpaBookingItemAvgAggregateOutputType = {
    priceSnapshot: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaBookingItemSumAggregateOutputType = {
    priceSnapshot: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaBookingItemMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    bookingId: string | null
    treatmentId: string | null
    treatmentNameSnapshot: string | null
    priceSnapshot: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaBookingItemMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    bookingId: string | null
    treatmentId: string | null
    treatmentNameSnapshot: string | null
    priceSnapshot: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaBookingItemCountAggregateOutputType = {
    id: number
    storeId: number
    bookingId: number
    treatmentId: number
    treatmentNameSnapshot: number
    priceSnapshot: number
    serviceMinutes: number
    bufferMinutes: number
    sortOrder: number
    _all: number
  }


  export type SpaBookingItemAvgAggregateInputType = {
    priceSnapshot?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaBookingItemSumAggregateInputType = {
    priceSnapshot?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaBookingItemMinAggregateInputType = {
    id?: true
    storeId?: true
    bookingId?: true
    treatmentId?: true
    treatmentNameSnapshot?: true
    priceSnapshot?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaBookingItemMaxAggregateInputType = {
    id?: true
    storeId?: true
    bookingId?: true
    treatmentId?: true
    treatmentNameSnapshot?: true
    priceSnapshot?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaBookingItemCountAggregateInputType = {
    id?: true
    storeId?: true
    bookingId?: true
    treatmentId?: true
    treatmentNameSnapshot?: true
    priceSnapshot?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
    _all?: true
  }

  export type SpaBookingItemAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaBookingItem to aggregate.
     */
    where?: SpaBookingItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookingItems to fetch.
     */
    orderBy?: SpaBookingItemOrderByWithRelationInput | SpaBookingItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaBookingItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookingItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookingItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaBookingItems
    **/
    _count?: true | SpaBookingItemCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SpaBookingItemAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SpaBookingItemSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaBookingItemMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaBookingItemMaxAggregateInputType
  }

  export type GetSpaBookingItemAggregateType<T extends SpaBookingItemAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaBookingItem]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaBookingItem[P]>
      : GetScalarType<T[P], AggregateSpaBookingItem[P]>
  }




  export type SpaBookingItemGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaBookingItemWhereInput
    orderBy?: SpaBookingItemOrderByWithAggregationInput | SpaBookingItemOrderByWithAggregationInput[]
    by: SpaBookingItemScalarFieldEnum[] | SpaBookingItemScalarFieldEnum
    having?: SpaBookingItemScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaBookingItemCountAggregateInputType | true
    _avg?: SpaBookingItemAvgAggregateInputType
    _sum?: SpaBookingItemSumAggregateInputType
    _min?: SpaBookingItemMinAggregateInputType
    _max?: SpaBookingItemMaxAggregateInputType
  }

  export type SpaBookingItemGroupByOutputType = {
    id: string
    storeId: string
    bookingId: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal
    serviceMinutes: number
    bufferMinutes: number
    sortOrder: number
    _count: SpaBookingItemCountAggregateOutputType | null
    _avg: SpaBookingItemAvgAggregateOutputType | null
    _sum: SpaBookingItemSumAggregateOutputType | null
    _min: SpaBookingItemMinAggregateOutputType | null
    _max: SpaBookingItemMaxAggregateOutputType | null
  }

  type GetSpaBookingItemGroupByPayload<T extends SpaBookingItemGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaBookingItemGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaBookingItemGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaBookingItemGroupByOutputType[P]>
            : GetScalarType<T[P], SpaBookingItemGroupByOutputType[P]>
        }
      >
    >


  export type SpaBookingItemSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    bookingId?: boolean
    treatmentId?: boolean
    treatmentNameSnapshot?: boolean
    priceSnapshot?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    sortOrder?: boolean
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaBookingItem"]>

  export type SpaBookingItemSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    bookingId?: boolean
    treatmentId?: boolean
    treatmentNameSnapshot?: boolean
    priceSnapshot?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    sortOrder?: boolean
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaBookingItem"]>

  export type SpaBookingItemSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    bookingId?: boolean
    treatmentId?: boolean
    treatmentNameSnapshot?: boolean
    priceSnapshot?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    sortOrder?: boolean
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaBookingItem"]>

  export type SpaBookingItemSelectScalar = {
    id?: boolean
    storeId?: boolean
    bookingId?: boolean
    treatmentId?: boolean
    treatmentNameSnapshot?: boolean
    priceSnapshot?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    sortOrder?: boolean
  }

  export type SpaBookingItemOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "bookingId" | "treatmentId" | "treatmentNameSnapshot" | "priceSnapshot" | "serviceMinutes" | "bufferMinutes" | "sortOrder", ExtArgs["result"]["spaBookingItem"]>
  export type SpaBookingItemInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }
  export type SpaBookingItemIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }
  export type SpaBookingItemIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    booking?: boolean | SpaBookingDefaultArgs<ExtArgs>
  }

  export type $SpaBookingItemPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaBookingItem"
    objects: {
      booking: Prisma.$SpaBookingPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      bookingId: string
      treatmentId: string
      treatmentNameSnapshot: string
      priceSnapshot: Prisma.Decimal
      serviceMinutes: number
      bufferMinutes: number
      sortOrder: number
    }, ExtArgs["result"]["spaBookingItem"]>
    composites: {}
  }

  type SpaBookingItemGetPayload<S extends boolean | null | undefined | SpaBookingItemDefaultArgs> = $Result.GetResult<Prisma.$SpaBookingItemPayload, S>

  type SpaBookingItemCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaBookingItemFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaBookingItemCountAggregateInputType | true
    }

  export interface SpaBookingItemDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaBookingItem'], meta: { name: 'SpaBookingItem' } }
    /**
     * Find zero or one SpaBookingItem that matches the filter.
     * @param {SpaBookingItemFindUniqueArgs} args - Arguments to find a SpaBookingItem
     * @example
     * // Get one SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaBookingItemFindUniqueArgs>(args: SelectSubset<T, SpaBookingItemFindUniqueArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaBookingItem that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaBookingItemFindUniqueOrThrowArgs} args - Arguments to find a SpaBookingItem
     * @example
     * // Get one SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaBookingItemFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaBookingItemFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaBookingItem that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemFindFirstArgs} args - Arguments to find a SpaBookingItem
     * @example
     * // Get one SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaBookingItemFindFirstArgs>(args?: SelectSubset<T, SpaBookingItemFindFirstArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaBookingItem that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemFindFirstOrThrowArgs} args - Arguments to find a SpaBookingItem
     * @example
     * // Get one SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaBookingItemFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaBookingItemFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaBookingItems that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaBookingItems
     * const spaBookingItems = await prisma.spaBookingItem.findMany()
     * 
     * // Get first 10 SpaBookingItems
     * const spaBookingItems = await prisma.spaBookingItem.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaBookingItemWithIdOnly = await prisma.spaBookingItem.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaBookingItemFindManyArgs>(args?: SelectSubset<T, SpaBookingItemFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaBookingItem.
     * @param {SpaBookingItemCreateArgs} args - Arguments to create a SpaBookingItem.
     * @example
     * // Create one SpaBookingItem
     * const SpaBookingItem = await prisma.spaBookingItem.create({
     *   data: {
     *     // ... data to create a SpaBookingItem
     *   }
     * })
     * 
     */
    create<T extends SpaBookingItemCreateArgs>(args: SelectSubset<T, SpaBookingItemCreateArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaBookingItems.
     * @param {SpaBookingItemCreateManyArgs} args - Arguments to create many SpaBookingItems.
     * @example
     * // Create many SpaBookingItems
     * const spaBookingItem = await prisma.spaBookingItem.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaBookingItemCreateManyArgs>(args?: SelectSubset<T, SpaBookingItemCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaBookingItems and returns the data saved in the database.
     * @param {SpaBookingItemCreateManyAndReturnArgs} args - Arguments to create many SpaBookingItems.
     * @example
     * // Create many SpaBookingItems
     * const spaBookingItem = await prisma.spaBookingItem.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaBookingItems and only return the `id`
     * const spaBookingItemWithIdOnly = await prisma.spaBookingItem.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaBookingItemCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaBookingItemCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaBookingItem.
     * @param {SpaBookingItemDeleteArgs} args - Arguments to delete one SpaBookingItem.
     * @example
     * // Delete one SpaBookingItem
     * const SpaBookingItem = await prisma.spaBookingItem.delete({
     *   where: {
     *     // ... filter to delete one SpaBookingItem
     *   }
     * })
     * 
     */
    delete<T extends SpaBookingItemDeleteArgs>(args: SelectSubset<T, SpaBookingItemDeleteArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaBookingItem.
     * @param {SpaBookingItemUpdateArgs} args - Arguments to update one SpaBookingItem.
     * @example
     * // Update one SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaBookingItemUpdateArgs>(args: SelectSubset<T, SpaBookingItemUpdateArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaBookingItems.
     * @param {SpaBookingItemDeleteManyArgs} args - Arguments to filter SpaBookingItems to delete.
     * @example
     * // Delete a few SpaBookingItems
     * const { count } = await prisma.spaBookingItem.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaBookingItemDeleteManyArgs>(args?: SelectSubset<T, SpaBookingItemDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaBookingItems.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaBookingItems
     * const spaBookingItem = await prisma.spaBookingItem.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaBookingItemUpdateManyArgs>(args: SelectSubset<T, SpaBookingItemUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaBookingItems and returns the data updated in the database.
     * @param {SpaBookingItemUpdateManyAndReturnArgs} args - Arguments to update many SpaBookingItems.
     * @example
     * // Update many SpaBookingItems
     * const spaBookingItem = await prisma.spaBookingItem.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaBookingItems and only return the `id`
     * const spaBookingItemWithIdOnly = await prisma.spaBookingItem.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaBookingItemUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaBookingItemUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaBookingItem.
     * @param {SpaBookingItemUpsertArgs} args - Arguments to update or create a SpaBookingItem.
     * @example
     * // Update or create a SpaBookingItem
     * const spaBookingItem = await prisma.spaBookingItem.upsert({
     *   create: {
     *     // ... data to create a SpaBookingItem
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaBookingItem we want to update
     *   }
     * })
     */
    upsert<T extends SpaBookingItemUpsertArgs>(args: SelectSubset<T, SpaBookingItemUpsertArgs<ExtArgs>>): Prisma__SpaBookingItemClient<$Result.GetResult<Prisma.$SpaBookingItemPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaBookingItems.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemCountArgs} args - Arguments to filter SpaBookingItems to count.
     * @example
     * // Count the number of SpaBookingItems
     * const count = await prisma.spaBookingItem.count({
     *   where: {
     *     // ... the filter for the SpaBookingItems we want to count
     *   }
     * })
    **/
    count<T extends SpaBookingItemCountArgs>(
      args?: Subset<T, SpaBookingItemCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaBookingItemCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaBookingItem.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaBookingItemAggregateArgs>(args: Subset<T, SpaBookingItemAggregateArgs>): Prisma.PrismaPromise<GetSpaBookingItemAggregateType<T>>

    /**
     * Group by SpaBookingItem.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaBookingItemGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaBookingItemGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaBookingItemGroupByArgs['orderBy'] }
        : { orderBy?: SpaBookingItemGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaBookingItemGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaBookingItemGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaBookingItem model
   */
  readonly fields: SpaBookingItemFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaBookingItem.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaBookingItemClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    booking<T extends SpaBookingDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SpaBookingDefaultArgs<ExtArgs>>): Prisma__SpaBookingClient<$Result.GetResult<Prisma.$SpaBookingPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaBookingItem model
   */
  interface SpaBookingItemFieldRefs {
    readonly id: FieldRef<"SpaBookingItem", 'String'>
    readonly storeId: FieldRef<"SpaBookingItem", 'String'>
    readonly bookingId: FieldRef<"SpaBookingItem", 'String'>
    readonly treatmentId: FieldRef<"SpaBookingItem", 'String'>
    readonly treatmentNameSnapshot: FieldRef<"SpaBookingItem", 'String'>
    readonly priceSnapshot: FieldRef<"SpaBookingItem", 'Decimal'>
    readonly serviceMinutes: FieldRef<"SpaBookingItem", 'Int'>
    readonly bufferMinutes: FieldRef<"SpaBookingItem", 'Int'>
    readonly sortOrder: FieldRef<"SpaBookingItem", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * SpaBookingItem findUnique
   */
  export type SpaBookingItemFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookingItem to fetch.
     */
    where: SpaBookingItemWhereUniqueInput
  }

  /**
   * SpaBookingItem findUniqueOrThrow
   */
  export type SpaBookingItemFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookingItem to fetch.
     */
    where: SpaBookingItemWhereUniqueInput
  }

  /**
   * SpaBookingItem findFirst
   */
  export type SpaBookingItemFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookingItem to fetch.
     */
    where?: SpaBookingItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookingItems to fetch.
     */
    orderBy?: SpaBookingItemOrderByWithRelationInput | SpaBookingItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaBookingItems.
     */
    cursor?: SpaBookingItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookingItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookingItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaBookingItems.
     */
    distinct?: SpaBookingItemScalarFieldEnum | SpaBookingItemScalarFieldEnum[]
  }

  /**
   * SpaBookingItem findFirstOrThrow
   */
  export type SpaBookingItemFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookingItem to fetch.
     */
    where?: SpaBookingItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookingItems to fetch.
     */
    orderBy?: SpaBookingItemOrderByWithRelationInput | SpaBookingItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaBookingItems.
     */
    cursor?: SpaBookingItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookingItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookingItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaBookingItems.
     */
    distinct?: SpaBookingItemScalarFieldEnum | SpaBookingItemScalarFieldEnum[]
  }

  /**
   * SpaBookingItem findMany
   */
  export type SpaBookingItemFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter, which SpaBookingItems to fetch.
     */
    where?: SpaBookingItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaBookingItems to fetch.
     */
    orderBy?: SpaBookingItemOrderByWithRelationInput | SpaBookingItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaBookingItems.
     */
    cursor?: SpaBookingItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaBookingItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaBookingItems.
     */
    skip?: number
    distinct?: SpaBookingItemScalarFieldEnum | SpaBookingItemScalarFieldEnum[]
  }

  /**
   * SpaBookingItem create
   */
  export type SpaBookingItemCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaBookingItem.
     */
    data: XOR<SpaBookingItemCreateInput, SpaBookingItemUncheckedCreateInput>
  }

  /**
   * SpaBookingItem createMany
   */
  export type SpaBookingItemCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaBookingItems.
     */
    data: SpaBookingItemCreateManyInput | SpaBookingItemCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaBookingItem createManyAndReturn
   */
  export type SpaBookingItemCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * The data used to create many SpaBookingItems.
     */
    data: SpaBookingItemCreateManyInput | SpaBookingItemCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaBookingItem update
   */
  export type SpaBookingItemUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaBookingItem.
     */
    data: XOR<SpaBookingItemUpdateInput, SpaBookingItemUncheckedUpdateInput>
    /**
     * Choose, which SpaBookingItem to update.
     */
    where: SpaBookingItemWhereUniqueInput
  }

  /**
   * SpaBookingItem updateMany
   */
  export type SpaBookingItemUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaBookingItems.
     */
    data: XOR<SpaBookingItemUpdateManyMutationInput, SpaBookingItemUncheckedUpdateManyInput>
    /**
     * Filter which SpaBookingItems to update
     */
    where?: SpaBookingItemWhereInput
    /**
     * Limit how many SpaBookingItems to update.
     */
    limit?: number
  }

  /**
   * SpaBookingItem updateManyAndReturn
   */
  export type SpaBookingItemUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * The data used to update SpaBookingItems.
     */
    data: XOR<SpaBookingItemUpdateManyMutationInput, SpaBookingItemUncheckedUpdateManyInput>
    /**
     * Filter which SpaBookingItems to update
     */
    where?: SpaBookingItemWhereInput
    /**
     * Limit how many SpaBookingItems to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaBookingItem upsert
   */
  export type SpaBookingItemUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaBookingItem to update in case it exists.
     */
    where: SpaBookingItemWhereUniqueInput
    /**
     * In case the SpaBookingItem found by the `where` argument doesn't exist, create a new SpaBookingItem with this data.
     */
    create: XOR<SpaBookingItemCreateInput, SpaBookingItemUncheckedCreateInput>
    /**
     * In case the SpaBookingItem was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaBookingItemUpdateInput, SpaBookingItemUncheckedUpdateInput>
  }

  /**
   * SpaBookingItem delete
   */
  export type SpaBookingItemDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
    /**
     * Filter which SpaBookingItem to delete.
     */
    where: SpaBookingItemWhereUniqueInput
  }

  /**
   * SpaBookingItem deleteMany
   */
  export type SpaBookingItemDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaBookingItems to delete
     */
    where?: SpaBookingItemWhereInput
    /**
     * Limit how many SpaBookingItems to delete.
     */
    limit?: number
  }

  /**
   * SpaBookingItem without action
   */
  export type SpaBookingItemDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaBookingItem
     */
    select?: SpaBookingItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaBookingItem
     */
    omit?: SpaBookingItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaBookingItemInclude<ExtArgs> | null
  }


  /**
   * Model SpaTreatment
   */

  export type AggregateSpaTreatment = {
    _count: SpaTreatmentCountAggregateOutputType | null
    _avg: SpaTreatmentAvgAggregateOutputType | null
    _sum: SpaTreatmentSumAggregateOutputType | null
    _min: SpaTreatmentMinAggregateOutputType | null
    _max: SpaTreatmentMaxAggregateOutputType | null
  }

  export type SpaTreatmentAvgAggregateOutputType = {
    price: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaTreatmentSumAggregateOutputType = {
    price: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    sortOrder: number | null
  }

  export type SpaTreatmentMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    name: string | null
    variantLabel: string | null
    price: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    publicVisible: boolean | null
    isActive: boolean | null
    sortOrder: number | null
  }

  export type SpaTreatmentMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    name: string | null
    variantLabel: string | null
    price: Decimal | null
    serviceMinutes: number | null
    bufferMinutes: number | null
    publicVisible: boolean | null
    isActive: boolean | null
    sortOrder: number | null
  }

  export type SpaTreatmentCountAggregateOutputType = {
    id: number
    storeId: number
    name: number
    variantLabel: number
    price: number
    serviceMinutes: number
    bufferMinutes: number
    publicVisible: number
    isActive: number
    sortOrder: number
    _all: number
  }


  export type SpaTreatmentAvgAggregateInputType = {
    price?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaTreatmentSumAggregateInputType = {
    price?: true
    serviceMinutes?: true
    bufferMinutes?: true
    sortOrder?: true
  }

  export type SpaTreatmentMinAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    variantLabel?: true
    price?: true
    serviceMinutes?: true
    bufferMinutes?: true
    publicVisible?: true
    isActive?: true
    sortOrder?: true
  }

  export type SpaTreatmentMaxAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    variantLabel?: true
    price?: true
    serviceMinutes?: true
    bufferMinutes?: true
    publicVisible?: true
    isActive?: true
    sortOrder?: true
  }

  export type SpaTreatmentCountAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    variantLabel?: true
    price?: true
    serviceMinutes?: true
    bufferMinutes?: true
    publicVisible?: true
    isActive?: true
    sortOrder?: true
    _all?: true
  }

  export type SpaTreatmentAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaTreatment to aggregate.
     */
    where?: SpaTreatmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatments to fetch.
     */
    orderBy?: SpaTreatmentOrderByWithRelationInput | SpaTreatmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaTreatmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaTreatments
    **/
    _count?: true | SpaTreatmentCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SpaTreatmentAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SpaTreatmentSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaTreatmentMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaTreatmentMaxAggregateInputType
  }

  export type GetSpaTreatmentAggregateType<T extends SpaTreatmentAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaTreatment]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaTreatment[P]>
      : GetScalarType<T[P], AggregateSpaTreatment[P]>
  }




  export type SpaTreatmentGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaTreatmentWhereInput
    orderBy?: SpaTreatmentOrderByWithAggregationInput | SpaTreatmentOrderByWithAggregationInput[]
    by: SpaTreatmentScalarFieldEnum[] | SpaTreatmentScalarFieldEnum
    having?: SpaTreatmentScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaTreatmentCountAggregateInputType | true
    _avg?: SpaTreatmentAvgAggregateInputType
    _sum?: SpaTreatmentSumAggregateInputType
    _min?: SpaTreatmentMinAggregateInputType
    _max?: SpaTreatmentMaxAggregateInputType
  }

  export type SpaTreatmentGroupByOutputType = {
    id: string
    storeId: string
    name: string
    variantLabel: string | null
    price: Decimal
    serviceMinutes: number
    bufferMinutes: number
    publicVisible: boolean
    isActive: boolean
    sortOrder: number
    _count: SpaTreatmentCountAggregateOutputType | null
    _avg: SpaTreatmentAvgAggregateOutputType | null
    _sum: SpaTreatmentSumAggregateOutputType | null
    _min: SpaTreatmentMinAggregateOutputType | null
    _max: SpaTreatmentMaxAggregateOutputType | null
  }

  type GetSpaTreatmentGroupByPayload<T extends SpaTreatmentGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaTreatmentGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaTreatmentGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaTreatmentGroupByOutputType[P]>
            : GetScalarType<T[P], SpaTreatmentGroupByOutputType[P]>
        }
      >
    >


  export type SpaTreatmentSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    variantLabel?: boolean
    price?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: boolean
    skills?: boolean | SpaTreatment$skillsArgs<ExtArgs>
    _count?: boolean | SpaTreatmentCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaTreatment"]>

  export type SpaTreatmentSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    variantLabel?: boolean
    price?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }, ExtArgs["result"]["spaTreatment"]>

  export type SpaTreatmentSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    variantLabel?: boolean
    price?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }, ExtArgs["result"]["spaTreatment"]>

  export type SpaTreatmentSelectScalar = {
    id?: boolean
    storeId?: boolean
    name?: boolean
    variantLabel?: boolean
    price?: boolean
    serviceMinutes?: boolean
    bufferMinutes?: boolean
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }

  export type SpaTreatmentOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "name" | "variantLabel" | "price" | "serviceMinutes" | "bufferMinutes" | "publicVisible" | "isActive" | "sortOrder", ExtArgs["result"]["spaTreatment"]>
  export type SpaTreatmentInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    skills?: boolean | SpaTreatment$skillsArgs<ExtArgs>
    _count?: boolean | SpaTreatmentCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SpaTreatmentIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SpaTreatmentIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SpaTreatmentPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaTreatment"
    objects: {
      skills: Prisma.$SpaTreatmentSkillPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      name: string
      variantLabel: string | null
      price: Prisma.Decimal
      serviceMinutes: number
      bufferMinutes: number
      publicVisible: boolean
      isActive: boolean
      sortOrder: number
    }, ExtArgs["result"]["spaTreatment"]>
    composites: {}
  }

  type SpaTreatmentGetPayload<S extends boolean | null | undefined | SpaTreatmentDefaultArgs> = $Result.GetResult<Prisma.$SpaTreatmentPayload, S>

  type SpaTreatmentCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaTreatmentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaTreatmentCountAggregateInputType | true
    }

  export interface SpaTreatmentDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaTreatment'], meta: { name: 'SpaTreatment' } }
    /**
     * Find zero or one SpaTreatment that matches the filter.
     * @param {SpaTreatmentFindUniqueArgs} args - Arguments to find a SpaTreatment
     * @example
     * // Get one SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaTreatmentFindUniqueArgs>(args: SelectSubset<T, SpaTreatmentFindUniqueArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaTreatment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaTreatmentFindUniqueOrThrowArgs} args - Arguments to find a SpaTreatment
     * @example
     * // Get one SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaTreatmentFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaTreatmentFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaTreatment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentFindFirstArgs} args - Arguments to find a SpaTreatment
     * @example
     * // Get one SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaTreatmentFindFirstArgs>(args?: SelectSubset<T, SpaTreatmentFindFirstArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaTreatment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentFindFirstOrThrowArgs} args - Arguments to find a SpaTreatment
     * @example
     * // Get one SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaTreatmentFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaTreatmentFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaTreatments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaTreatments
     * const spaTreatments = await prisma.spaTreatment.findMany()
     * 
     * // Get first 10 SpaTreatments
     * const spaTreatments = await prisma.spaTreatment.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaTreatmentWithIdOnly = await prisma.spaTreatment.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaTreatmentFindManyArgs>(args?: SelectSubset<T, SpaTreatmentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaTreatment.
     * @param {SpaTreatmentCreateArgs} args - Arguments to create a SpaTreatment.
     * @example
     * // Create one SpaTreatment
     * const SpaTreatment = await prisma.spaTreatment.create({
     *   data: {
     *     // ... data to create a SpaTreatment
     *   }
     * })
     * 
     */
    create<T extends SpaTreatmentCreateArgs>(args: SelectSubset<T, SpaTreatmentCreateArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaTreatments.
     * @param {SpaTreatmentCreateManyArgs} args - Arguments to create many SpaTreatments.
     * @example
     * // Create many SpaTreatments
     * const spaTreatment = await prisma.spaTreatment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaTreatmentCreateManyArgs>(args?: SelectSubset<T, SpaTreatmentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaTreatments and returns the data saved in the database.
     * @param {SpaTreatmentCreateManyAndReturnArgs} args - Arguments to create many SpaTreatments.
     * @example
     * // Create many SpaTreatments
     * const spaTreatment = await prisma.spaTreatment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaTreatments and only return the `id`
     * const spaTreatmentWithIdOnly = await prisma.spaTreatment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaTreatmentCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaTreatmentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaTreatment.
     * @param {SpaTreatmentDeleteArgs} args - Arguments to delete one SpaTreatment.
     * @example
     * // Delete one SpaTreatment
     * const SpaTreatment = await prisma.spaTreatment.delete({
     *   where: {
     *     // ... filter to delete one SpaTreatment
     *   }
     * })
     * 
     */
    delete<T extends SpaTreatmentDeleteArgs>(args: SelectSubset<T, SpaTreatmentDeleteArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaTreatment.
     * @param {SpaTreatmentUpdateArgs} args - Arguments to update one SpaTreatment.
     * @example
     * // Update one SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaTreatmentUpdateArgs>(args: SelectSubset<T, SpaTreatmentUpdateArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaTreatments.
     * @param {SpaTreatmentDeleteManyArgs} args - Arguments to filter SpaTreatments to delete.
     * @example
     * // Delete a few SpaTreatments
     * const { count } = await prisma.spaTreatment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaTreatmentDeleteManyArgs>(args?: SelectSubset<T, SpaTreatmentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaTreatments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaTreatments
     * const spaTreatment = await prisma.spaTreatment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaTreatmentUpdateManyArgs>(args: SelectSubset<T, SpaTreatmentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaTreatments and returns the data updated in the database.
     * @param {SpaTreatmentUpdateManyAndReturnArgs} args - Arguments to update many SpaTreatments.
     * @example
     * // Update many SpaTreatments
     * const spaTreatment = await prisma.spaTreatment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaTreatments and only return the `id`
     * const spaTreatmentWithIdOnly = await prisma.spaTreatment.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaTreatmentUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaTreatmentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaTreatment.
     * @param {SpaTreatmentUpsertArgs} args - Arguments to update or create a SpaTreatment.
     * @example
     * // Update or create a SpaTreatment
     * const spaTreatment = await prisma.spaTreatment.upsert({
     *   create: {
     *     // ... data to create a SpaTreatment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaTreatment we want to update
     *   }
     * })
     */
    upsert<T extends SpaTreatmentUpsertArgs>(args: SelectSubset<T, SpaTreatmentUpsertArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaTreatments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentCountArgs} args - Arguments to filter SpaTreatments to count.
     * @example
     * // Count the number of SpaTreatments
     * const count = await prisma.spaTreatment.count({
     *   where: {
     *     // ... the filter for the SpaTreatments we want to count
     *   }
     * })
    **/
    count<T extends SpaTreatmentCountArgs>(
      args?: Subset<T, SpaTreatmentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaTreatmentCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaTreatment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaTreatmentAggregateArgs>(args: Subset<T, SpaTreatmentAggregateArgs>): Prisma.PrismaPromise<GetSpaTreatmentAggregateType<T>>

    /**
     * Group by SpaTreatment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaTreatmentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaTreatmentGroupByArgs['orderBy'] }
        : { orderBy?: SpaTreatmentGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaTreatmentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaTreatmentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaTreatment model
   */
  readonly fields: SpaTreatmentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaTreatment.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaTreatmentClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    skills<T extends SpaTreatment$skillsArgs<ExtArgs> = {}>(args?: Subset<T, SpaTreatment$skillsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaTreatment model
   */
  interface SpaTreatmentFieldRefs {
    readonly id: FieldRef<"SpaTreatment", 'String'>
    readonly storeId: FieldRef<"SpaTreatment", 'String'>
    readonly name: FieldRef<"SpaTreatment", 'String'>
    readonly variantLabel: FieldRef<"SpaTreatment", 'String'>
    readonly price: FieldRef<"SpaTreatment", 'Decimal'>
    readonly serviceMinutes: FieldRef<"SpaTreatment", 'Int'>
    readonly bufferMinutes: FieldRef<"SpaTreatment", 'Int'>
    readonly publicVisible: FieldRef<"SpaTreatment", 'Boolean'>
    readonly isActive: FieldRef<"SpaTreatment", 'Boolean'>
    readonly sortOrder: FieldRef<"SpaTreatment", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * SpaTreatment findUnique
   */
  export type SpaTreatmentFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatment to fetch.
     */
    where: SpaTreatmentWhereUniqueInput
  }

  /**
   * SpaTreatment findUniqueOrThrow
   */
  export type SpaTreatmentFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatment to fetch.
     */
    where: SpaTreatmentWhereUniqueInput
  }

  /**
   * SpaTreatment findFirst
   */
  export type SpaTreatmentFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatment to fetch.
     */
    where?: SpaTreatmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatments to fetch.
     */
    orderBy?: SpaTreatmentOrderByWithRelationInput | SpaTreatmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaTreatments.
     */
    cursor?: SpaTreatmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaTreatments.
     */
    distinct?: SpaTreatmentScalarFieldEnum | SpaTreatmentScalarFieldEnum[]
  }

  /**
   * SpaTreatment findFirstOrThrow
   */
  export type SpaTreatmentFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatment to fetch.
     */
    where?: SpaTreatmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatments to fetch.
     */
    orderBy?: SpaTreatmentOrderByWithRelationInput | SpaTreatmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaTreatments.
     */
    cursor?: SpaTreatmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaTreatments.
     */
    distinct?: SpaTreatmentScalarFieldEnum | SpaTreatmentScalarFieldEnum[]
  }

  /**
   * SpaTreatment findMany
   */
  export type SpaTreatmentFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatments to fetch.
     */
    where?: SpaTreatmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatments to fetch.
     */
    orderBy?: SpaTreatmentOrderByWithRelationInput | SpaTreatmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaTreatments.
     */
    cursor?: SpaTreatmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatments.
     */
    skip?: number
    distinct?: SpaTreatmentScalarFieldEnum | SpaTreatmentScalarFieldEnum[]
  }

  /**
   * SpaTreatment create
   */
  export type SpaTreatmentCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaTreatment.
     */
    data: XOR<SpaTreatmentCreateInput, SpaTreatmentUncheckedCreateInput>
  }

  /**
   * SpaTreatment createMany
   */
  export type SpaTreatmentCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaTreatments.
     */
    data: SpaTreatmentCreateManyInput | SpaTreatmentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaTreatment createManyAndReturn
   */
  export type SpaTreatmentCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * The data used to create many SpaTreatments.
     */
    data: SpaTreatmentCreateManyInput | SpaTreatmentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaTreatment update
   */
  export type SpaTreatmentUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaTreatment.
     */
    data: XOR<SpaTreatmentUpdateInput, SpaTreatmentUncheckedUpdateInput>
    /**
     * Choose, which SpaTreatment to update.
     */
    where: SpaTreatmentWhereUniqueInput
  }

  /**
   * SpaTreatment updateMany
   */
  export type SpaTreatmentUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaTreatments.
     */
    data: XOR<SpaTreatmentUpdateManyMutationInput, SpaTreatmentUncheckedUpdateManyInput>
    /**
     * Filter which SpaTreatments to update
     */
    where?: SpaTreatmentWhereInput
    /**
     * Limit how many SpaTreatments to update.
     */
    limit?: number
  }

  /**
   * SpaTreatment updateManyAndReturn
   */
  export type SpaTreatmentUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * The data used to update SpaTreatments.
     */
    data: XOR<SpaTreatmentUpdateManyMutationInput, SpaTreatmentUncheckedUpdateManyInput>
    /**
     * Filter which SpaTreatments to update
     */
    where?: SpaTreatmentWhereInput
    /**
     * Limit how many SpaTreatments to update.
     */
    limit?: number
  }

  /**
   * SpaTreatment upsert
   */
  export type SpaTreatmentUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaTreatment to update in case it exists.
     */
    where: SpaTreatmentWhereUniqueInput
    /**
     * In case the SpaTreatment found by the `where` argument doesn't exist, create a new SpaTreatment with this data.
     */
    create: XOR<SpaTreatmentCreateInput, SpaTreatmentUncheckedCreateInput>
    /**
     * In case the SpaTreatment was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaTreatmentUpdateInput, SpaTreatmentUncheckedUpdateInput>
  }

  /**
   * SpaTreatment delete
   */
  export type SpaTreatmentDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
    /**
     * Filter which SpaTreatment to delete.
     */
    where: SpaTreatmentWhereUniqueInput
  }

  /**
   * SpaTreatment deleteMany
   */
  export type SpaTreatmentDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaTreatments to delete
     */
    where?: SpaTreatmentWhereInput
    /**
     * Limit how many SpaTreatments to delete.
     */
    limit?: number
  }

  /**
   * SpaTreatment.skills
   */
  export type SpaTreatment$skillsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    where?: SpaTreatmentSkillWhereInput
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    cursor?: SpaTreatmentSkillWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SpaTreatmentSkillScalarFieldEnum | SpaTreatmentSkillScalarFieldEnum[]
  }

  /**
   * SpaTreatment without action
   */
  export type SpaTreatmentDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatment
     */
    select?: SpaTreatmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatment
     */
    omit?: SpaTreatmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentInclude<ExtArgs> | null
  }


  /**
   * Model SpaSkill
   */

  export type AggregateSpaSkill = {
    _count: SpaSkillCountAggregateOutputType | null
    _avg: SpaSkillAvgAggregateOutputType | null
    _sum: SpaSkillSumAggregateOutputType | null
    _min: SpaSkillMinAggregateOutputType | null
    _max: SpaSkillMaxAggregateOutputType | null
  }

  export type SpaSkillAvgAggregateOutputType = {
    sortOrder: number | null
  }

  export type SpaSkillSumAggregateOutputType = {
    sortOrder: number | null
  }

  export type SpaSkillMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    name: string | null
    isActive: boolean | null
    sortOrder: number | null
  }

  export type SpaSkillMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    name: string | null
    isActive: boolean | null
    sortOrder: number | null
  }

  export type SpaSkillCountAggregateOutputType = {
    id: number
    storeId: number
    name: number
    isActive: number
    sortOrder: number
    _all: number
  }


  export type SpaSkillAvgAggregateInputType = {
    sortOrder?: true
  }

  export type SpaSkillSumAggregateInputType = {
    sortOrder?: true
  }

  export type SpaSkillMinAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    isActive?: true
    sortOrder?: true
  }

  export type SpaSkillMaxAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    isActive?: true
    sortOrder?: true
  }

  export type SpaSkillCountAggregateInputType = {
    id?: true
    storeId?: true
    name?: true
    isActive?: true
    sortOrder?: true
    _all?: true
  }

  export type SpaSkillAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaSkill to aggregate.
     */
    where?: SpaSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaSkills to fetch.
     */
    orderBy?: SpaSkillOrderByWithRelationInput | SpaSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaSkills
    **/
    _count?: true | SpaSkillCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SpaSkillAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SpaSkillSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaSkillMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaSkillMaxAggregateInputType
  }

  export type GetSpaSkillAggregateType<T extends SpaSkillAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaSkill]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaSkill[P]>
      : GetScalarType<T[P], AggregateSpaSkill[P]>
  }




  export type SpaSkillGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaSkillWhereInput
    orderBy?: SpaSkillOrderByWithAggregationInput | SpaSkillOrderByWithAggregationInput[]
    by: SpaSkillScalarFieldEnum[] | SpaSkillScalarFieldEnum
    having?: SpaSkillScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaSkillCountAggregateInputType | true
    _avg?: SpaSkillAvgAggregateInputType
    _sum?: SpaSkillSumAggregateInputType
    _min?: SpaSkillMinAggregateInputType
    _max?: SpaSkillMaxAggregateInputType
  }

  export type SpaSkillGroupByOutputType = {
    id: string
    storeId: string
    name: string
    isActive: boolean
    sortOrder: number
    _count: SpaSkillCountAggregateOutputType | null
    _avg: SpaSkillAvgAggregateOutputType | null
    _sum: SpaSkillSumAggregateOutputType | null
    _min: SpaSkillMinAggregateOutputType | null
    _max: SpaSkillMaxAggregateOutputType | null
  }

  type GetSpaSkillGroupByPayload<T extends SpaSkillGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaSkillGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaSkillGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaSkillGroupByOutputType[P]>
            : GetScalarType<T[P], SpaSkillGroupByOutputType[P]>
        }
      >
    >


  export type SpaSkillSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    isActive?: boolean
    sortOrder?: boolean
    treatments?: boolean | SpaSkill$treatmentsArgs<ExtArgs>
    staff?: boolean | SpaSkill$staffArgs<ExtArgs>
    _count?: boolean | SpaSkillCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaSkill"]>

  export type SpaSkillSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }, ExtArgs["result"]["spaSkill"]>

  export type SpaSkillSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    name?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }, ExtArgs["result"]["spaSkill"]>

  export type SpaSkillSelectScalar = {
    id?: boolean
    storeId?: boolean
    name?: boolean
    isActive?: boolean
    sortOrder?: boolean
  }

  export type SpaSkillOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "name" | "isActive" | "sortOrder", ExtArgs["result"]["spaSkill"]>
  export type SpaSkillInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    treatments?: boolean | SpaSkill$treatmentsArgs<ExtArgs>
    staff?: boolean | SpaSkill$staffArgs<ExtArgs>
    _count?: boolean | SpaSkillCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SpaSkillIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SpaSkillIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SpaSkillPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaSkill"
    objects: {
      treatments: Prisma.$SpaTreatmentSkillPayload<ExtArgs>[]
      staff: Prisma.$SpaStaffSkillPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      name: string
      isActive: boolean
      sortOrder: number
    }, ExtArgs["result"]["spaSkill"]>
    composites: {}
  }

  type SpaSkillGetPayload<S extends boolean | null | undefined | SpaSkillDefaultArgs> = $Result.GetResult<Prisma.$SpaSkillPayload, S>

  type SpaSkillCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaSkillFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaSkillCountAggregateInputType | true
    }

  export interface SpaSkillDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaSkill'], meta: { name: 'SpaSkill' } }
    /**
     * Find zero or one SpaSkill that matches the filter.
     * @param {SpaSkillFindUniqueArgs} args - Arguments to find a SpaSkill
     * @example
     * // Get one SpaSkill
     * const spaSkill = await prisma.spaSkill.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaSkillFindUniqueArgs>(args: SelectSubset<T, SpaSkillFindUniqueArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaSkill that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaSkillFindUniqueOrThrowArgs} args - Arguments to find a SpaSkill
     * @example
     * // Get one SpaSkill
     * const spaSkill = await prisma.spaSkill.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaSkillFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaSkillFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaSkill that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillFindFirstArgs} args - Arguments to find a SpaSkill
     * @example
     * // Get one SpaSkill
     * const spaSkill = await prisma.spaSkill.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaSkillFindFirstArgs>(args?: SelectSubset<T, SpaSkillFindFirstArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaSkill that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillFindFirstOrThrowArgs} args - Arguments to find a SpaSkill
     * @example
     * // Get one SpaSkill
     * const spaSkill = await prisma.spaSkill.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaSkillFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaSkillFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaSkills that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaSkills
     * const spaSkills = await prisma.spaSkill.findMany()
     * 
     * // Get first 10 SpaSkills
     * const spaSkills = await prisma.spaSkill.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaSkillWithIdOnly = await prisma.spaSkill.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaSkillFindManyArgs>(args?: SelectSubset<T, SpaSkillFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaSkill.
     * @param {SpaSkillCreateArgs} args - Arguments to create a SpaSkill.
     * @example
     * // Create one SpaSkill
     * const SpaSkill = await prisma.spaSkill.create({
     *   data: {
     *     // ... data to create a SpaSkill
     *   }
     * })
     * 
     */
    create<T extends SpaSkillCreateArgs>(args: SelectSubset<T, SpaSkillCreateArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaSkills.
     * @param {SpaSkillCreateManyArgs} args - Arguments to create many SpaSkills.
     * @example
     * // Create many SpaSkills
     * const spaSkill = await prisma.spaSkill.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaSkillCreateManyArgs>(args?: SelectSubset<T, SpaSkillCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaSkills and returns the data saved in the database.
     * @param {SpaSkillCreateManyAndReturnArgs} args - Arguments to create many SpaSkills.
     * @example
     * // Create many SpaSkills
     * const spaSkill = await prisma.spaSkill.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaSkills and only return the `id`
     * const spaSkillWithIdOnly = await prisma.spaSkill.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaSkillCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaSkillCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaSkill.
     * @param {SpaSkillDeleteArgs} args - Arguments to delete one SpaSkill.
     * @example
     * // Delete one SpaSkill
     * const SpaSkill = await prisma.spaSkill.delete({
     *   where: {
     *     // ... filter to delete one SpaSkill
     *   }
     * })
     * 
     */
    delete<T extends SpaSkillDeleteArgs>(args: SelectSubset<T, SpaSkillDeleteArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaSkill.
     * @param {SpaSkillUpdateArgs} args - Arguments to update one SpaSkill.
     * @example
     * // Update one SpaSkill
     * const spaSkill = await prisma.spaSkill.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaSkillUpdateArgs>(args: SelectSubset<T, SpaSkillUpdateArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaSkills.
     * @param {SpaSkillDeleteManyArgs} args - Arguments to filter SpaSkills to delete.
     * @example
     * // Delete a few SpaSkills
     * const { count } = await prisma.spaSkill.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaSkillDeleteManyArgs>(args?: SelectSubset<T, SpaSkillDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaSkills
     * const spaSkill = await prisma.spaSkill.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaSkillUpdateManyArgs>(args: SelectSubset<T, SpaSkillUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaSkills and returns the data updated in the database.
     * @param {SpaSkillUpdateManyAndReturnArgs} args - Arguments to update many SpaSkills.
     * @example
     * // Update many SpaSkills
     * const spaSkill = await prisma.spaSkill.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaSkills and only return the `id`
     * const spaSkillWithIdOnly = await prisma.spaSkill.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaSkillUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaSkillUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaSkill.
     * @param {SpaSkillUpsertArgs} args - Arguments to update or create a SpaSkill.
     * @example
     * // Update or create a SpaSkill
     * const spaSkill = await prisma.spaSkill.upsert({
     *   create: {
     *     // ... data to create a SpaSkill
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaSkill we want to update
     *   }
     * })
     */
    upsert<T extends SpaSkillUpsertArgs>(args: SelectSubset<T, SpaSkillUpsertArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillCountArgs} args - Arguments to filter SpaSkills to count.
     * @example
     * // Count the number of SpaSkills
     * const count = await prisma.spaSkill.count({
     *   where: {
     *     // ... the filter for the SpaSkills we want to count
     *   }
     * })
    **/
    count<T extends SpaSkillCountArgs>(
      args?: Subset<T, SpaSkillCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaSkillCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaSkillAggregateArgs>(args: Subset<T, SpaSkillAggregateArgs>): Prisma.PrismaPromise<GetSpaSkillAggregateType<T>>

    /**
     * Group by SpaSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaSkillGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaSkillGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaSkillGroupByArgs['orderBy'] }
        : { orderBy?: SpaSkillGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaSkillGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaSkillGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaSkill model
   */
  readonly fields: SpaSkillFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaSkill.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaSkillClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    treatments<T extends SpaSkill$treatmentsArgs<ExtArgs> = {}>(args?: Subset<T, SpaSkill$treatmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    staff<T extends SpaSkill$staffArgs<ExtArgs> = {}>(args?: Subset<T, SpaSkill$staffArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaSkill model
   */
  interface SpaSkillFieldRefs {
    readonly id: FieldRef<"SpaSkill", 'String'>
    readonly storeId: FieldRef<"SpaSkill", 'String'>
    readonly name: FieldRef<"SpaSkill", 'String'>
    readonly isActive: FieldRef<"SpaSkill", 'Boolean'>
    readonly sortOrder: FieldRef<"SpaSkill", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * SpaSkill findUnique
   */
  export type SpaSkillFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaSkill to fetch.
     */
    where: SpaSkillWhereUniqueInput
  }

  /**
   * SpaSkill findUniqueOrThrow
   */
  export type SpaSkillFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaSkill to fetch.
     */
    where: SpaSkillWhereUniqueInput
  }

  /**
   * SpaSkill findFirst
   */
  export type SpaSkillFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaSkill to fetch.
     */
    where?: SpaSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaSkills to fetch.
     */
    orderBy?: SpaSkillOrderByWithRelationInput | SpaSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaSkills.
     */
    cursor?: SpaSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaSkills.
     */
    distinct?: SpaSkillScalarFieldEnum | SpaSkillScalarFieldEnum[]
  }

  /**
   * SpaSkill findFirstOrThrow
   */
  export type SpaSkillFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaSkill to fetch.
     */
    where?: SpaSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaSkills to fetch.
     */
    orderBy?: SpaSkillOrderByWithRelationInput | SpaSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaSkills.
     */
    cursor?: SpaSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaSkills.
     */
    distinct?: SpaSkillScalarFieldEnum | SpaSkillScalarFieldEnum[]
  }

  /**
   * SpaSkill findMany
   */
  export type SpaSkillFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaSkills to fetch.
     */
    where?: SpaSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaSkills to fetch.
     */
    orderBy?: SpaSkillOrderByWithRelationInput | SpaSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaSkills.
     */
    cursor?: SpaSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaSkills.
     */
    skip?: number
    distinct?: SpaSkillScalarFieldEnum | SpaSkillScalarFieldEnum[]
  }

  /**
   * SpaSkill create
   */
  export type SpaSkillCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaSkill.
     */
    data: XOR<SpaSkillCreateInput, SpaSkillUncheckedCreateInput>
  }

  /**
   * SpaSkill createMany
   */
  export type SpaSkillCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaSkills.
     */
    data: SpaSkillCreateManyInput | SpaSkillCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaSkill createManyAndReturn
   */
  export type SpaSkillCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * The data used to create many SpaSkills.
     */
    data: SpaSkillCreateManyInput | SpaSkillCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaSkill update
   */
  export type SpaSkillUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaSkill.
     */
    data: XOR<SpaSkillUpdateInput, SpaSkillUncheckedUpdateInput>
    /**
     * Choose, which SpaSkill to update.
     */
    where: SpaSkillWhereUniqueInput
  }

  /**
   * SpaSkill updateMany
   */
  export type SpaSkillUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaSkills.
     */
    data: XOR<SpaSkillUpdateManyMutationInput, SpaSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaSkills to update
     */
    where?: SpaSkillWhereInput
    /**
     * Limit how many SpaSkills to update.
     */
    limit?: number
  }

  /**
   * SpaSkill updateManyAndReturn
   */
  export type SpaSkillUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * The data used to update SpaSkills.
     */
    data: XOR<SpaSkillUpdateManyMutationInput, SpaSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaSkills to update
     */
    where?: SpaSkillWhereInput
    /**
     * Limit how many SpaSkills to update.
     */
    limit?: number
  }

  /**
   * SpaSkill upsert
   */
  export type SpaSkillUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaSkill to update in case it exists.
     */
    where: SpaSkillWhereUniqueInput
    /**
     * In case the SpaSkill found by the `where` argument doesn't exist, create a new SpaSkill with this data.
     */
    create: XOR<SpaSkillCreateInput, SpaSkillUncheckedCreateInput>
    /**
     * In case the SpaSkill was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaSkillUpdateInput, SpaSkillUncheckedUpdateInput>
  }

  /**
   * SpaSkill delete
   */
  export type SpaSkillDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
    /**
     * Filter which SpaSkill to delete.
     */
    where: SpaSkillWhereUniqueInput
  }

  /**
   * SpaSkill deleteMany
   */
  export type SpaSkillDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaSkills to delete
     */
    where?: SpaSkillWhereInput
    /**
     * Limit how many SpaSkills to delete.
     */
    limit?: number
  }

  /**
   * SpaSkill.treatments
   */
  export type SpaSkill$treatmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    where?: SpaTreatmentSkillWhereInput
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    cursor?: SpaTreatmentSkillWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SpaTreatmentSkillScalarFieldEnum | SpaTreatmentSkillScalarFieldEnum[]
  }

  /**
   * SpaSkill.staff
   */
  export type SpaSkill$staffArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    where?: SpaStaffSkillWhereInput
    orderBy?: SpaStaffSkillOrderByWithRelationInput | SpaStaffSkillOrderByWithRelationInput[]
    cursor?: SpaStaffSkillWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SpaStaffSkillScalarFieldEnum | SpaStaffSkillScalarFieldEnum[]
  }

  /**
   * SpaSkill without action
   */
  export type SpaSkillDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaSkill
     */
    select?: SpaSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaSkill
     */
    omit?: SpaSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaSkillInclude<ExtArgs> | null
  }


  /**
   * Model SpaTreatmentSkill
   */

  export type AggregateSpaTreatmentSkill = {
    _count: SpaTreatmentSkillCountAggregateOutputType | null
    _min: SpaTreatmentSkillMinAggregateOutputType | null
    _max: SpaTreatmentSkillMaxAggregateOutputType | null
  }

  export type SpaTreatmentSkillMinAggregateOutputType = {
    storeId: string | null
    treatmentId: string | null
    skillId: string | null
  }

  export type SpaTreatmentSkillMaxAggregateOutputType = {
    storeId: string | null
    treatmentId: string | null
    skillId: string | null
  }

  export type SpaTreatmentSkillCountAggregateOutputType = {
    storeId: number
    treatmentId: number
    skillId: number
    _all: number
  }


  export type SpaTreatmentSkillMinAggregateInputType = {
    storeId?: true
    treatmentId?: true
    skillId?: true
  }

  export type SpaTreatmentSkillMaxAggregateInputType = {
    storeId?: true
    treatmentId?: true
    skillId?: true
  }

  export type SpaTreatmentSkillCountAggregateInputType = {
    storeId?: true
    treatmentId?: true
    skillId?: true
    _all?: true
  }

  export type SpaTreatmentSkillAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaTreatmentSkill to aggregate.
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatmentSkills to fetch.
     */
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaTreatmentSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatmentSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatmentSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaTreatmentSkills
    **/
    _count?: true | SpaTreatmentSkillCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaTreatmentSkillMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaTreatmentSkillMaxAggregateInputType
  }

  export type GetSpaTreatmentSkillAggregateType<T extends SpaTreatmentSkillAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaTreatmentSkill]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaTreatmentSkill[P]>
      : GetScalarType<T[P], AggregateSpaTreatmentSkill[P]>
  }




  export type SpaTreatmentSkillGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaTreatmentSkillWhereInput
    orderBy?: SpaTreatmentSkillOrderByWithAggregationInput | SpaTreatmentSkillOrderByWithAggregationInput[]
    by: SpaTreatmentSkillScalarFieldEnum[] | SpaTreatmentSkillScalarFieldEnum
    having?: SpaTreatmentSkillScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaTreatmentSkillCountAggregateInputType | true
    _min?: SpaTreatmentSkillMinAggregateInputType
    _max?: SpaTreatmentSkillMaxAggregateInputType
  }

  export type SpaTreatmentSkillGroupByOutputType = {
    storeId: string
    treatmentId: string
    skillId: string
    _count: SpaTreatmentSkillCountAggregateOutputType | null
    _min: SpaTreatmentSkillMinAggregateOutputType | null
    _max: SpaTreatmentSkillMaxAggregateOutputType | null
  }

  type GetSpaTreatmentSkillGroupByPayload<T extends SpaTreatmentSkillGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaTreatmentSkillGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaTreatmentSkillGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaTreatmentSkillGroupByOutputType[P]>
            : GetScalarType<T[P], SpaTreatmentSkillGroupByOutputType[P]>
        }
      >
    >


  export type SpaTreatmentSkillSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    treatmentId?: boolean
    skillId?: boolean
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaTreatmentSkill"]>

  export type SpaTreatmentSkillSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    treatmentId?: boolean
    skillId?: boolean
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaTreatmentSkill"]>

  export type SpaTreatmentSkillSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    treatmentId?: boolean
    skillId?: boolean
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaTreatmentSkill"]>

  export type SpaTreatmentSkillSelectScalar = {
    storeId?: boolean
    treatmentId?: boolean
    skillId?: boolean
  }

  export type SpaTreatmentSkillOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"storeId" | "treatmentId" | "skillId", ExtArgs["result"]["spaTreatmentSkill"]>
  export type SpaTreatmentSkillInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }
  export type SpaTreatmentSkillIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }
  export type SpaTreatmentSkillIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    treatment?: boolean | SpaTreatmentDefaultArgs<ExtArgs>
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }

  export type $SpaTreatmentSkillPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaTreatmentSkill"
    objects: {
      treatment: Prisma.$SpaTreatmentPayload<ExtArgs>
      skill: Prisma.$SpaSkillPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      storeId: string
      treatmentId: string
      skillId: string
    }, ExtArgs["result"]["spaTreatmentSkill"]>
    composites: {}
  }

  type SpaTreatmentSkillGetPayload<S extends boolean | null | undefined | SpaTreatmentSkillDefaultArgs> = $Result.GetResult<Prisma.$SpaTreatmentSkillPayload, S>

  type SpaTreatmentSkillCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaTreatmentSkillFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaTreatmentSkillCountAggregateInputType | true
    }

  export interface SpaTreatmentSkillDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaTreatmentSkill'], meta: { name: 'SpaTreatmentSkill' } }
    /**
     * Find zero or one SpaTreatmentSkill that matches the filter.
     * @param {SpaTreatmentSkillFindUniqueArgs} args - Arguments to find a SpaTreatmentSkill
     * @example
     * // Get one SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaTreatmentSkillFindUniqueArgs>(args: SelectSubset<T, SpaTreatmentSkillFindUniqueArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaTreatmentSkill that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaTreatmentSkillFindUniqueOrThrowArgs} args - Arguments to find a SpaTreatmentSkill
     * @example
     * // Get one SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaTreatmentSkillFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaTreatmentSkillFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaTreatmentSkill that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillFindFirstArgs} args - Arguments to find a SpaTreatmentSkill
     * @example
     * // Get one SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaTreatmentSkillFindFirstArgs>(args?: SelectSubset<T, SpaTreatmentSkillFindFirstArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaTreatmentSkill that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillFindFirstOrThrowArgs} args - Arguments to find a SpaTreatmentSkill
     * @example
     * // Get one SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaTreatmentSkillFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaTreatmentSkillFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaTreatmentSkills that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaTreatmentSkills
     * const spaTreatmentSkills = await prisma.spaTreatmentSkill.findMany()
     * 
     * // Get first 10 SpaTreatmentSkills
     * const spaTreatmentSkills = await prisma.spaTreatmentSkill.findMany({ take: 10 })
     * 
     * // Only select the `storeId`
     * const spaTreatmentSkillWithStoreIdOnly = await prisma.spaTreatmentSkill.findMany({ select: { storeId: true } })
     * 
     */
    findMany<T extends SpaTreatmentSkillFindManyArgs>(args?: SelectSubset<T, SpaTreatmentSkillFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaTreatmentSkill.
     * @param {SpaTreatmentSkillCreateArgs} args - Arguments to create a SpaTreatmentSkill.
     * @example
     * // Create one SpaTreatmentSkill
     * const SpaTreatmentSkill = await prisma.spaTreatmentSkill.create({
     *   data: {
     *     // ... data to create a SpaTreatmentSkill
     *   }
     * })
     * 
     */
    create<T extends SpaTreatmentSkillCreateArgs>(args: SelectSubset<T, SpaTreatmentSkillCreateArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaTreatmentSkills.
     * @param {SpaTreatmentSkillCreateManyArgs} args - Arguments to create many SpaTreatmentSkills.
     * @example
     * // Create many SpaTreatmentSkills
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaTreatmentSkillCreateManyArgs>(args?: SelectSubset<T, SpaTreatmentSkillCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaTreatmentSkills and returns the data saved in the database.
     * @param {SpaTreatmentSkillCreateManyAndReturnArgs} args - Arguments to create many SpaTreatmentSkills.
     * @example
     * // Create many SpaTreatmentSkills
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaTreatmentSkills and only return the `storeId`
     * const spaTreatmentSkillWithStoreIdOnly = await prisma.spaTreatmentSkill.createManyAndReturn({
     *   select: { storeId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaTreatmentSkillCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaTreatmentSkillCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaTreatmentSkill.
     * @param {SpaTreatmentSkillDeleteArgs} args - Arguments to delete one SpaTreatmentSkill.
     * @example
     * // Delete one SpaTreatmentSkill
     * const SpaTreatmentSkill = await prisma.spaTreatmentSkill.delete({
     *   where: {
     *     // ... filter to delete one SpaTreatmentSkill
     *   }
     * })
     * 
     */
    delete<T extends SpaTreatmentSkillDeleteArgs>(args: SelectSubset<T, SpaTreatmentSkillDeleteArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaTreatmentSkill.
     * @param {SpaTreatmentSkillUpdateArgs} args - Arguments to update one SpaTreatmentSkill.
     * @example
     * // Update one SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaTreatmentSkillUpdateArgs>(args: SelectSubset<T, SpaTreatmentSkillUpdateArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaTreatmentSkills.
     * @param {SpaTreatmentSkillDeleteManyArgs} args - Arguments to filter SpaTreatmentSkills to delete.
     * @example
     * // Delete a few SpaTreatmentSkills
     * const { count } = await prisma.spaTreatmentSkill.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaTreatmentSkillDeleteManyArgs>(args?: SelectSubset<T, SpaTreatmentSkillDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaTreatmentSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaTreatmentSkills
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaTreatmentSkillUpdateManyArgs>(args: SelectSubset<T, SpaTreatmentSkillUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaTreatmentSkills and returns the data updated in the database.
     * @param {SpaTreatmentSkillUpdateManyAndReturnArgs} args - Arguments to update many SpaTreatmentSkills.
     * @example
     * // Update many SpaTreatmentSkills
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaTreatmentSkills and only return the `storeId`
     * const spaTreatmentSkillWithStoreIdOnly = await prisma.spaTreatmentSkill.updateManyAndReturn({
     *   select: { storeId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaTreatmentSkillUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaTreatmentSkillUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaTreatmentSkill.
     * @param {SpaTreatmentSkillUpsertArgs} args - Arguments to update or create a SpaTreatmentSkill.
     * @example
     * // Update or create a SpaTreatmentSkill
     * const spaTreatmentSkill = await prisma.spaTreatmentSkill.upsert({
     *   create: {
     *     // ... data to create a SpaTreatmentSkill
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaTreatmentSkill we want to update
     *   }
     * })
     */
    upsert<T extends SpaTreatmentSkillUpsertArgs>(args: SelectSubset<T, SpaTreatmentSkillUpsertArgs<ExtArgs>>): Prisma__SpaTreatmentSkillClient<$Result.GetResult<Prisma.$SpaTreatmentSkillPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaTreatmentSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillCountArgs} args - Arguments to filter SpaTreatmentSkills to count.
     * @example
     * // Count the number of SpaTreatmentSkills
     * const count = await prisma.spaTreatmentSkill.count({
     *   where: {
     *     // ... the filter for the SpaTreatmentSkills we want to count
     *   }
     * })
    **/
    count<T extends SpaTreatmentSkillCountArgs>(
      args?: Subset<T, SpaTreatmentSkillCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaTreatmentSkillCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaTreatmentSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaTreatmentSkillAggregateArgs>(args: Subset<T, SpaTreatmentSkillAggregateArgs>): Prisma.PrismaPromise<GetSpaTreatmentSkillAggregateType<T>>

    /**
     * Group by SpaTreatmentSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaTreatmentSkillGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaTreatmentSkillGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaTreatmentSkillGroupByArgs['orderBy'] }
        : { orderBy?: SpaTreatmentSkillGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaTreatmentSkillGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaTreatmentSkillGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaTreatmentSkill model
   */
  readonly fields: SpaTreatmentSkillFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaTreatmentSkill.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaTreatmentSkillClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    treatment<T extends SpaTreatmentDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SpaTreatmentDefaultArgs<ExtArgs>>): Prisma__SpaTreatmentClient<$Result.GetResult<Prisma.$SpaTreatmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    skill<T extends SpaSkillDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SpaSkillDefaultArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaTreatmentSkill model
   */
  interface SpaTreatmentSkillFieldRefs {
    readonly storeId: FieldRef<"SpaTreatmentSkill", 'String'>
    readonly treatmentId: FieldRef<"SpaTreatmentSkill", 'String'>
    readonly skillId: FieldRef<"SpaTreatmentSkill", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SpaTreatmentSkill findUnique
   */
  export type SpaTreatmentSkillFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatmentSkill to fetch.
     */
    where: SpaTreatmentSkillWhereUniqueInput
  }

  /**
   * SpaTreatmentSkill findUniqueOrThrow
   */
  export type SpaTreatmentSkillFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatmentSkill to fetch.
     */
    where: SpaTreatmentSkillWhereUniqueInput
  }

  /**
   * SpaTreatmentSkill findFirst
   */
  export type SpaTreatmentSkillFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatmentSkill to fetch.
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatmentSkills to fetch.
     */
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaTreatmentSkills.
     */
    cursor?: SpaTreatmentSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatmentSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatmentSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaTreatmentSkills.
     */
    distinct?: SpaTreatmentSkillScalarFieldEnum | SpaTreatmentSkillScalarFieldEnum[]
  }

  /**
   * SpaTreatmentSkill findFirstOrThrow
   */
  export type SpaTreatmentSkillFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatmentSkill to fetch.
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatmentSkills to fetch.
     */
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaTreatmentSkills.
     */
    cursor?: SpaTreatmentSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatmentSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatmentSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaTreatmentSkills.
     */
    distinct?: SpaTreatmentSkillScalarFieldEnum | SpaTreatmentSkillScalarFieldEnum[]
  }

  /**
   * SpaTreatmentSkill findMany
   */
  export type SpaTreatmentSkillFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaTreatmentSkills to fetch.
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaTreatmentSkills to fetch.
     */
    orderBy?: SpaTreatmentSkillOrderByWithRelationInput | SpaTreatmentSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaTreatmentSkills.
     */
    cursor?: SpaTreatmentSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaTreatmentSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaTreatmentSkills.
     */
    skip?: number
    distinct?: SpaTreatmentSkillScalarFieldEnum | SpaTreatmentSkillScalarFieldEnum[]
  }

  /**
   * SpaTreatmentSkill create
   */
  export type SpaTreatmentSkillCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaTreatmentSkill.
     */
    data: XOR<SpaTreatmentSkillCreateInput, SpaTreatmentSkillUncheckedCreateInput>
  }

  /**
   * SpaTreatmentSkill createMany
   */
  export type SpaTreatmentSkillCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaTreatmentSkills.
     */
    data: SpaTreatmentSkillCreateManyInput | SpaTreatmentSkillCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaTreatmentSkill createManyAndReturn
   */
  export type SpaTreatmentSkillCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * The data used to create many SpaTreatmentSkills.
     */
    data: SpaTreatmentSkillCreateManyInput | SpaTreatmentSkillCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaTreatmentSkill update
   */
  export type SpaTreatmentSkillUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaTreatmentSkill.
     */
    data: XOR<SpaTreatmentSkillUpdateInput, SpaTreatmentSkillUncheckedUpdateInput>
    /**
     * Choose, which SpaTreatmentSkill to update.
     */
    where: SpaTreatmentSkillWhereUniqueInput
  }

  /**
   * SpaTreatmentSkill updateMany
   */
  export type SpaTreatmentSkillUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaTreatmentSkills.
     */
    data: XOR<SpaTreatmentSkillUpdateManyMutationInput, SpaTreatmentSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaTreatmentSkills to update
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * Limit how many SpaTreatmentSkills to update.
     */
    limit?: number
  }

  /**
   * SpaTreatmentSkill updateManyAndReturn
   */
  export type SpaTreatmentSkillUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * The data used to update SpaTreatmentSkills.
     */
    data: XOR<SpaTreatmentSkillUpdateManyMutationInput, SpaTreatmentSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaTreatmentSkills to update
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * Limit how many SpaTreatmentSkills to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaTreatmentSkill upsert
   */
  export type SpaTreatmentSkillUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaTreatmentSkill to update in case it exists.
     */
    where: SpaTreatmentSkillWhereUniqueInput
    /**
     * In case the SpaTreatmentSkill found by the `where` argument doesn't exist, create a new SpaTreatmentSkill with this data.
     */
    create: XOR<SpaTreatmentSkillCreateInput, SpaTreatmentSkillUncheckedCreateInput>
    /**
     * In case the SpaTreatmentSkill was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaTreatmentSkillUpdateInput, SpaTreatmentSkillUncheckedUpdateInput>
  }

  /**
   * SpaTreatmentSkill delete
   */
  export type SpaTreatmentSkillDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
    /**
     * Filter which SpaTreatmentSkill to delete.
     */
    where: SpaTreatmentSkillWhereUniqueInput
  }

  /**
   * SpaTreatmentSkill deleteMany
   */
  export type SpaTreatmentSkillDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaTreatmentSkills to delete
     */
    where?: SpaTreatmentSkillWhereInput
    /**
     * Limit how many SpaTreatmentSkills to delete.
     */
    limit?: number
  }

  /**
   * SpaTreatmentSkill without action
   */
  export type SpaTreatmentSkillDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaTreatmentSkill
     */
    select?: SpaTreatmentSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaTreatmentSkill
     */
    omit?: SpaTreatmentSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaTreatmentSkillInclude<ExtArgs> | null
  }


  /**
   * Model SpaStaffSkill
   */

  export type AggregateSpaStaffSkill = {
    _count: SpaStaffSkillCountAggregateOutputType | null
    _min: SpaStaffSkillMinAggregateOutputType | null
    _max: SpaStaffSkillMaxAggregateOutputType | null
  }

  export type SpaStaffSkillMinAggregateOutputType = {
    storeId: string | null
    staffId: string | null
    skillId: string | null
  }

  export type SpaStaffSkillMaxAggregateOutputType = {
    storeId: string | null
    staffId: string | null
    skillId: string | null
  }

  export type SpaStaffSkillCountAggregateOutputType = {
    storeId: number
    staffId: number
    skillId: number
    _all: number
  }


  export type SpaStaffSkillMinAggregateInputType = {
    storeId?: true
    staffId?: true
    skillId?: true
  }

  export type SpaStaffSkillMaxAggregateInputType = {
    storeId?: true
    staffId?: true
    skillId?: true
  }

  export type SpaStaffSkillCountAggregateInputType = {
    storeId?: true
    staffId?: true
    skillId?: true
    _all?: true
  }

  export type SpaStaffSkillAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffSkill to aggregate.
     */
    where?: SpaStaffSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffSkills to fetch.
     */
    orderBy?: SpaStaffSkillOrderByWithRelationInput | SpaStaffSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaStaffSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaStaffSkills
    **/
    _count?: true | SpaStaffSkillCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaStaffSkillMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaStaffSkillMaxAggregateInputType
  }

  export type GetSpaStaffSkillAggregateType<T extends SpaStaffSkillAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaStaffSkill]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaStaffSkill[P]>
      : GetScalarType<T[P], AggregateSpaStaffSkill[P]>
  }




  export type SpaStaffSkillGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaStaffSkillWhereInput
    orderBy?: SpaStaffSkillOrderByWithAggregationInput | SpaStaffSkillOrderByWithAggregationInput[]
    by: SpaStaffSkillScalarFieldEnum[] | SpaStaffSkillScalarFieldEnum
    having?: SpaStaffSkillScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaStaffSkillCountAggregateInputType | true
    _min?: SpaStaffSkillMinAggregateInputType
    _max?: SpaStaffSkillMaxAggregateInputType
  }

  export type SpaStaffSkillGroupByOutputType = {
    storeId: string
    staffId: string
    skillId: string
    _count: SpaStaffSkillCountAggregateOutputType | null
    _min: SpaStaffSkillMinAggregateOutputType | null
    _max: SpaStaffSkillMaxAggregateOutputType | null
  }

  type GetSpaStaffSkillGroupByPayload<T extends SpaStaffSkillGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaStaffSkillGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaStaffSkillGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaStaffSkillGroupByOutputType[P]>
            : GetScalarType<T[P], SpaStaffSkillGroupByOutputType[P]>
        }
      >
    >


  export type SpaStaffSkillSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    staffId?: boolean
    skillId?: boolean
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaStaffSkill"]>

  export type SpaStaffSkillSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    staffId?: boolean
    skillId?: boolean
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaStaffSkill"]>

  export type SpaStaffSkillSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    storeId?: boolean
    staffId?: boolean
    skillId?: boolean
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["spaStaffSkill"]>

  export type SpaStaffSkillSelectScalar = {
    storeId?: boolean
    staffId?: boolean
    skillId?: boolean
  }

  export type SpaStaffSkillOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"storeId" | "staffId" | "skillId", ExtArgs["result"]["spaStaffSkill"]>
  export type SpaStaffSkillInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }
  export type SpaStaffSkillIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }
  export type SpaStaffSkillIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    skill?: boolean | SpaSkillDefaultArgs<ExtArgs>
  }

  export type $SpaStaffSkillPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaStaffSkill"
    objects: {
      skill: Prisma.$SpaSkillPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      storeId: string
      staffId: string
      skillId: string
    }, ExtArgs["result"]["spaStaffSkill"]>
    composites: {}
  }

  type SpaStaffSkillGetPayload<S extends boolean | null | undefined | SpaStaffSkillDefaultArgs> = $Result.GetResult<Prisma.$SpaStaffSkillPayload, S>

  type SpaStaffSkillCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaStaffSkillFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaStaffSkillCountAggregateInputType | true
    }

  export interface SpaStaffSkillDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaStaffSkill'], meta: { name: 'SpaStaffSkill' } }
    /**
     * Find zero or one SpaStaffSkill that matches the filter.
     * @param {SpaStaffSkillFindUniqueArgs} args - Arguments to find a SpaStaffSkill
     * @example
     * // Get one SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaStaffSkillFindUniqueArgs>(args: SelectSubset<T, SpaStaffSkillFindUniqueArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaStaffSkill that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaStaffSkillFindUniqueOrThrowArgs} args - Arguments to find a SpaStaffSkill
     * @example
     * // Get one SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaStaffSkillFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaStaffSkillFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffSkill that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillFindFirstArgs} args - Arguments to find a SpaStaffSkill
     * @example
     * // Get one SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaStaffSkillFindFirstArgs>(args?: SelectSubset<T, SpaStaffSkillFindFirstArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffSkill that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillFindFirstOrThrowArgs} args - Arguments to find a SpaStaffSkill
     * @example
     * // Get one SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaStaffSkillFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaStaffSkillFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaStaffSkills that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaStaffSkills
     * const spaStaffSkills = await prisma.spaStaffSkill.findMany()
     * 
     * // Get first 10 SpaStaffSkills
     * const spaStaffSkills = await prisma.spaStaffSkill.findMany({ take: 10 })
     * 
     * // Only select the `storeId`
     * const spaStaffSkillWithStoreIdOnly = await prisma.spaStaffSkill.findMany({ select: { storeId: true } })
     * 
     */
    findMany<T extends SpaStaffSkillFindManyArgs>(args?: SelectSubset<T, SpaStaffSkillFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaStaffSkill.
     * @param {SpaStaffSkillCreateArgs} args - Arguments to create a SpaStaffSkill.
     * @example
     * // Create one SpaStaffSkill
     * const SpaStaffSkill = await prisma.spaStaffSkill.create({
     *   data: {
     *     // ... data to create a SpaStaffSkill
     *   }
     * })
     * 
     */
    create<T extends SpaStaffSkillCreateArgs>(args: SelectSubset<T, SpaStaffSkillCreateArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaStaffSkills.
     * @param {SpaStaffSkillCreateManyArgs} args - Arguments to create many SpaStaffSkills.
     * @example
     * // Create many SpaStaffSkills
     * const spaStaffSkill = await prisma.spaStaffSkill.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaStaffSkillCreateManyArgs>(args?: SelectSubset<T, SpaStaffSkillCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaStaffSkills and returns the data saved in the database.
     * @param {SpaStaffSkillCreateManyAndReturnArgs} args - Arguments to create many SpaStaffSkills.
     * @example
     * // Create many SpaStaffSkills
     * const spaStaffSkill = await prisma.spaStaffSkill.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaStaffSkills and only return the `storeId`
     * const spaStaffSkillWithStoreIdOnly = await prisma.spaStaffSkill.createManyAndReturn({
     *   select: { storeId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaStaffSkillCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaStaffSkillCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaStaffSkill.
     * @param {SpaStaffSkillDeleteArgs} args - Arguments to delete one SpaStaffSkill.
     * @example
     * // Delete one SpaStaffSkill
     * const SpaStaffSkill = await prisma.spaStaffSkill.delete({
     *   where: {
     *     // ... filter to delete one SpaStaffSkill
     *   }
     * })
     * 
     */
    delete<T extends SpaStaffSkillDeleteArgs>(args: SelectSubset<T, SpaStaffSkillDeleteArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaStaffSkill.
     * @param {SpaStaffSkillUpdateArgs} args - Arguments to update one SpaStaffSkill.
     * @example
     * // Update one SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaStaffSkillUpdateArgs>(args: SelectSubset<T, SpaStaffSkillUpdateArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaStaffSkills.
     * @param {SpaStaffSkillDeleteManyArgs} args - Arguments to filter SpaStaffSkills to delete.
     * @example
     * // Delete a few SpaStaffSkills
     * const { count } = await prisma.spaStaffSkill.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaStaffSkillDeleteManyArgs>(args?: SelectSubset<T, SpaStaffSkillDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaStaffSkills
     * const spaStaffSkill = await prisma.spaStaffSkill.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaStaffSkillUpdateManyArgs>(args: SelectSubset<T, SpaStaffSkillUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffSkills and returns the data updated in the database.
     * @param {SpaStaffSkillUpdateManyAndReturnArgs} args - Arguments to update many SpaStaffSkills.
     * @example
     * // Update many SpaStaffSkills
     * const spaStaffSkill = await prisma.spaStaffSkill.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaStaffSkills and only return the `storeId`
     * const spaStaffSkillWithStoreIdOnly = await prisma.spaStaffSkill.updateManyAndReturn({
     *   select: { storeId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaStaffSkillUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaStaffSkillUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaStaffSkill.
     * @param {SpaStaffSkillUpsertArgs} args - Arguments to update or create a SpaStaffSkill.
     * @example
     * // Update or create a SpaStaffSkill
     * const spaStaffSkill = await prisma.spaStaffSkill.upsert({
     *   create: {
     *     // ... data to create a SpaStaffSkill
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaStaffSkill we want to update
     *   }
     * })
     */
    upsert<T extends SpaStaffSkillUpsertArgs>(args: SelectSubset<T, SpaStaffSkillUpsertArgs<ExtArgs>>): Prisma__SpaStaffSkillClient<$Result.GetResult<Prisma.$SpaStaffSkillPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaStaffSkills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillCountArgs} args - Arguments to filter SpaStaffSkills to count.
     * @example
     * // Count the number of SpaStaffSkills
     * const count = await prisma.spaStaffSkill.count({
     *   where: {
     *     // ... the filter for the SpaStaffSkills we want to count
     *   }
     * })
    **/
    count<T extends SpaStaffSkillCountArgs>(
      args?: Subset<T, SpaStaffSkillCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaStaffSkillCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaStaffSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaStaffSkillAggregateArgs>(args: Subset<T, SpaStaffSkillAggregateArgs>): Prisma.PrismaPromise<GetSpaStaffSkillAggregateType<T>>

    /**
     * Group by SpaStaffSkill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffSkillGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaStaffSkillGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaStaffSkillGroupByArgs['orderBy'] }
        : { orderBy?: SpaStaffSkillGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaStaffSkillGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaStaffSkillGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaStaffSkill model
   */
  readonly fields: SpaStaffSkillFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaStaffSkill.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaStaffSkillClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    skill<T extends SpaSkillDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SpaSkillDefaultArgs<ExtArgs>>): Prisma__SpaSkillClient<$Result.GetResult<Prisma.$SpaSkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaStaffSkill model
   */
  interface SpaStaffSkillFieldRefs {
    readonly storeId: FieldRef<"SpaStaffSkill", 'String'>
    readonly staffId: FieldRef<"SpaStaffSkill", 'String'>
    readonly skillId: FieldRef<"SpaStaffSkill", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SpaStaffSkill findUnique
   */
  export type SpaStaffSkillFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaStaffSkill to fetch.
     */
    where: SpaStaffSkillWhereUniqueInput
  }

  /**
   * SpaStaffSkill findUniqueOrThrow
   */
  export type SpaStaffSkillFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaStaffSkill to fetch.
     */
    where: SpaStaffSkillWhereUniqueInput
  }

  /**
   * SpaStaffSkill findFirst
   */
  export type SpaStaffSkillFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaStaffSkill to fetch.
     */
    where?: SpaStaffSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffSkills to fetch.
     */
    orderBy?: SpaStaffSkillOrderByWithRelationInput | SpaStaffSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffSkills.
     */
    cursor?: SpaStaffSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffSkills.
     */
    distinct?: SpaStaffSkillScalarFieldEnum | SpaStaffSkillScalarFieldEnum[]
  }

  /**
   * SpaStaffSkill findFirstOrThrow
   */
  export type SpaStaffSkillFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaStaffSkill to fetch.
     */
    where?: SpaStaffSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffSkills to fetch.
     */
    orderBy?: SpaStaffSkillOrderByWithRelationInput | SpaStaffSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffSkills.
     */
    cursor?: SpaStaffSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffSkills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffSkills.
     */
    distinct?: SpaStaffSkillScalarFieldEnum | SpaStaffSkillScalarFieldEnum[]
  }

  /**
   * SpaStaffSkill findMany
   */
  export type SpaStaffSkillFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter, which SpaStaffSkills to fetch.
     */
    where?: SpaStaffSkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffSkills to fetch.
     */
    orderBy?: SpaStaffSkillOrderByWithRelationInput | SpaStaffSkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaStaffSkills.
     */
    cursor?: SpaStaffSkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffSkills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffSkills.
     */
    skip?: number
    distinct?: SpaStaffSkillScalarFieldEnum | SpaStaffSkillScalarFieldEnum[]
  }

  /**
   * SpaStaffSkill create
   */
  export type SpaStaffSkillCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * The data needed to create a SpaStaffSkill.
     */
    data: XOR<SpaStaffSkillCreateInput, SpaStaffSkillUncheckedCreateInput>
  }

  /**
   * SpaStaffSkill createMany
   */
  export type SpaStaffSkillCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaStaffSkills.
     */
    data: SpaStaffSkillCreateManyInput | SpaStaffSkillCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaStaffSkill createManyAndReturn
   */
  export type SpaStaffSkillCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * The data used to create many SpaStaffSkills.
     */
    data: SpaStaffSkillCreateManyInput | SpaStaffSkillCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaStaffSkill update
   */
  export type SpaStaffSkillUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * The data needed to update a SpaStaffSkill.
     */
    data: XOR<SpaStaffSkillUpdateInput, SpaStaffSkillUncheckedUpdateInput>
    /**
     * Choose, which SpaStaffSkill to update.
     */
    where: SpaStaffSkillWhereUniqueInput
  }

  /**
   * SpaStaffSkill updateMany
   */
  export type SpaStaffSkillUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaStaffSkills.
     */
    data: XOR<SpaStaffSkillUpdateManyMutationInput, SpaStaffSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffSkills to update
     */
    where?: SpaStaffSkillWhereInput
    /**
     * Limit how many SpaStaffSkills to update.
     */
    limit?: number
  }

  /**
   * SpaStaffSkill updateManyAndReturn
   */
  export type SpaStaffSkillUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * The data used to update SpaStaffSkills.
     */
    data: XOR<SpaStaffSkillUpdateManyMutationInput, SpaStaffSkillUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffSkills to update
     */
    where?: SpaStaffSkillWhereInput
    /**
     * Limit how many SpaStaffSkills to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SpaStaffSkill upsert
   */
  export type SpaStaffSkillUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * The filter to search for the SpaStaffSkill to update in case it exists.
     */
    where: SpaStaffSkillWhereUniqueInput
    /**
     * In case the SpaStaffSkill found by the `where` argument doesn't exist, create a new SpaStaffSkill with this data.
     */
    create: XOR<SpaStaffSkillCreateInput, SpaStaffSkillUncheckedCreateInput>
    /**
     * In case the SpaStaffSkill was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaStaffSkillUpdateInput, SpaStaffSkillUncheckedUpdateInput>
  }

  /**
   * SpaStaffSkill delete
   */
  export type SpaStaffSkillDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
    /**
     * Filter which SpaStaffSkill to delete.
     */
    where: SpaStaffSkillWhereUniqueInput
  }

  /**
   * SpaStaffSkill deleteMany
   */
  export type SpaStaffSkillDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffSkills to delete
     */
    where?: SpaStaffSkillWhereInput
    /**
     * Limit how many SpaStaffSkills to delete.
     */
    limit?: number
  }

  /**
   * SpaStaffSkill without action
   */
  export type SpaStaffSkillDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffSkill
     */
    select?: SpaStaffSkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffSkill
     */
    omit?: SpaStaffSkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SpaStaffSkillInclude<ExtArgs> | null
  }


  /**
   * Model SpaStaffAvailability
   */

  export type AggregateSpaStaffAvailability = {
    _count: SpaStaffAvailabilityCountAggregateOutputType | null
    _avg: SpaStaffAvailabilityAvgAggregateOutputType | null
    _sum: SpaStaffAvailabilitySumAggregateOutputType | null
    _min: SpaStaffAvailabilityMinAggregateOutputType | null
    _max: SpaStaffAvailabilityMaxAggregateOutputType | null
  }

  export type SpaStaffAvailabilityAvgAggregateOutputType = {
    dayOfWeek: number | null
  }

  export type SpaStaffAvailabilitySumAggregateOutputType = {
    dayOfWeek: number | null
  }

  export type SpaStaffAvailabilityMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    staffId: string | null
    dayOfWeek: number | null
    startTime: string | null
    endTime: string | null
    isActive: boolean | null
  }

  export type SpaStaffAvailabilityMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    staffId: string | null
    dayOfWeek: number | null
    startTime: string | null
    endTime: string | null
    isActive: boolean | null
  }

  export type SpaStaffAvailabilityCountAggregateOutputType = {
    id: number
    storeId: number
    staffId: number
    dayOfWeek: number
    startTime: number
    endTime: number
    isActive: number
    _all: number
  }


  export type SpaStaffAvailabilityAvgAggregateInputType = {
    dayOfWeek?: true
  }

  export type SpaStaffAvailabilitySumAggregateInputType = {
    dayOfWeek?: true
  }

  export type SpaStaffAvailabilityMinAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    dayOfWeek?: true
    startTime?: true
    endTime?: true
    isActive?: true
  }

  export type SpaStaffAvailabilityMaxAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    dayOfWeek?: true
    startTime?: true
    endTime?: true
    isActive?: true
  }

  export type SpaStaffAvailabilityCountAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    dayOfWeek?: true
    startTime?: true
    endTime?: true
    isActive?: true
    _all?: true
  }

  export type SpaStaffAvailabilityAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffAvailability to aggregate.
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilities to fetch.
     */
    orderBy?: SpaStaffAvailabilityOrderByWithRelationInput | SpaStaffAvailabilityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaStaffAvailabilityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaStaffAvailabilities
    **/
    _count?: true | SpaStaffAvailabilityCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SpaStaffAvailabilityAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SpaStaffAvailabilitySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaStaffAvailabilityMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaStaffAvailabilityMaxAggregateInputType
  }

  export type GetSpaStaffAvailabilityAggregateType<T extends SpaStaffAvailabilityAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaStaffAvailability]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaStaffAvailability[P]>
      : GetScalarType<T[P], AggregateSpaStaffAvailability[P]>
  }




  export type SpaStaffAvailabilityGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaStaffAvailabilityWhereInput
    orderBy?: SpaStaffAvailabilityOrderByWithAggregationInput | SpaStaffAvailabilityOrderByWithAggregationInput[]
    by: SpaStaffAvailabilityScalarFieldEnum[] | SpaStaffAvailabilityScalarFieldEnum
    having?: SpaStaffAvailabilityScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaStaffAvailabilityCountAggregateInputType | true
    _avg?: SpaStaffAvailabilityAvgAggregateInputType
    _sum?: SpaStaffAvailabilitySumAggregateInputType
    _min?: SpaStaffAvailabilityMinAggregateInputType
    _max?: SpaStaffAvailabilityMaxAggregateInputType
  }

  export type SpaStaffAvailabilityGroupByOutputType = {
    id: string
    storeId: string
    staffId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    isActive: boolean
    _count: SpaStaffAvailabilityCountAggregateOutputType | null
    _avg: SpaStaffAvailabilityAvgAggregateOutputType | null
    _sum: SpaStaffAvailabilitySumAggregateOutputType | null
    _min: SpaStaffAvailabilityMinAggregateOutputType | null
    _max: SpaStaffAvailabilityMaxAggregateOutputType | null
  }

  type GetSpaStaffAvailabilityGroupByPayload<T extends SpaStaffAvailabilityGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaStaffAvailabilityGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaStaffAvailabilityGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaStaffAvailabilityGroupByOutputType[P]>
            : GetScalarType<T[P], SpaStaffAvailabilityGroupByOutputType[P]>
        }
      >
    >


  export type SpaStaffAvailabilitySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    dayOfWeek?: boolean
    startTime?: boolean
    endTime?: boolean
    isActive?: boolean
  }, ExtArgs["result"]["spaStaffAvailability"]>

  export type SpaStaffAvailabilitySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    dayOfWeek?: boolean
    startTime?: boolean
    endTime?: boolean
    isActive?: boolean
  }, ExtArgs["result"]["spaStaffAvailability"]>

  export type SpaStaffAvailabilitySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    dayOfWeek?: boolean
    startTime?: boolean
    endTime?: boolean
    isActive?: boolean
  }, ExtArgs["result"]["spaStaffAvailability"]>

  export type SpaStaffAvailabilitySelectScalar = {
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    dayOfWeek?: boolean
    startTime?: boolean
    endTime?: boolean
    isActive?: boolean
  }

  export type SpaStaffAvailabilityOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "staffId" | "dayOfWeek" | "startTime" | "endTime" | "isActive", ExtArgs["result"]["spaStaffAvailability"]>

  export type $SpaStaffAvailabilityPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaStaffAvailability"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      staffId: string
      dayOfWeek: number
      startTime: string
      endTime: string
      isActive: boolean
    }, ExtArgs["result"]["spaStaffAvailability"]>
    composites: {}
  }

  type SpaStaffAvailabilityGetPayload<S extends boolean | null | undefined | SpaStaffAvailabilityDefaultArgs> = $Result.GetResult<Prisma.$SpaStaffAvailabilityPayload, S>

  type SpaStaffAvailabilityCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaStaffAvailabilityFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaStaffAvailabilityCountAggregateInputType | true
    }

  export interface SpaStaffAvailabilityDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaStaffAvailability'], meta: { name: 'SpaStaffAvailability' } }
    /**
     * Find zero or one SpaStaffAvailability that matches the filter.
     * @param {SpaStaffAvailabilityFindUniqueArgs} args - Arguments to find a SpaStaffAvailability
     * @example
     * // Get one SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaStaffAvailabilityFindUniqueArgs>(args: SelectSubset<T, SpaStaffAvailabilityFindUniqueArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaStaffAvailability that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaStaffAvailabilityFindUniqueOrThrowArgs} args - Arguments to find a SpaStaffAvailability
     * @example
     * // Get one SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaStaffAvailabilityFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaStaffAvailabilityFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffAvailability that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityFindFirstArgs} args - Arguments to find a SpaStaffAvailability
     * @example
     * // Get one SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaStaffAvailabilityFindFirstArgs>(args?: SelectSubset<T, SpaStaffAvailabilityFindFirstArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffAvailability that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityFindFirstOrThrowArgs} args - Arguments to find a SpaStaffAvailability
     * @example
     * // Get one SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaStaffAvailabilityFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaStaffAvailabilityFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaStaffAvailabilities that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaStaffAvailabilities
     * const spaStaffAvailabilities = await prisma.spaStaffAvailability.findMany()
     * 
     * // Get first 10 SpaStaffAvailabilities
     * const spaStaffAvailabilities = await prisma.spaStaffAvailability.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaStaffAvailabilityWithIdOnly = await prisma.spaStaffAvailability.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaStaffAvailabilityFindManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaStaffAvailability.
     * @param {SpaStaffAvailabilityCreateArgs} args - Arguments to create a SpaStaffAvailability.
     * @example
     * // Create one SpaStaffAvailability
     * const SpaStaffAvailability = await prisma.spaStaffAvailability.create({
     *   data: {
     *     // ... data to create a SpaStaffAvailability
     *   }
     * })
     * 
     */
    create<T extends SpaStaffAvailabilityCreateArgs>(args: SelectSubset<T, SpaStaffAvailabilityCreateArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaStaffAvailabilities.
     * @param {SpaStaffAvailabilityCreateManyArgs} args - Arguments to create many SpaStaffAvailabilities.
     * @example
     * // Create many SpaStaffAvailabilities
     * const spaStaffAvailability = await prisma.spaStaffAvailability.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaStaffAvailabilityCreateManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaStaffAvailabilities and returns the data saved in the database.
     * @param {SpaStaffAvailabilityCreateManyAndReturnArgs} args - Arguments to create many SpaStaffAvailabilities.
     * @example
     * // Create many SpaStaffAvailabilities
     * const spaStaffAvailability = await prisma.spaStaffAvailability.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaStaffAvailabilities and only return the `id`
     * const spaStaffAvailabilityWithIdOnly = await prisma.spaStaffAvailability.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaStaffAvailabilityCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaStaffAvailabilityCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaStaffAvailability.
     * @param {SpaStaffAvailabilityDeleteArgs} args - Arguments to delete one SpaStaffAvailability.
     * @example
     * // Delete one SpaStaffAvailability
     * const SpaStaffAvailability = await prisma.spaStaffAvailability.delete({
     *   where: {
     *     // ... filter to delete one SpaStaffAvailability
     *   }
     * })
     * 
     */
    delete<T extends SpaStaffAvailabilityDeleteArgs>(args: SelectSubset<T, SpaStaffAvailabilityDeleteArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaStaffAvailability.
     * @param {SpaStaffAvailabilityUpdateArgs} args - Arguments to update one SpaStaffAvailability.
     * @example
     * // Update one SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaStaffAvailabilityUpdateArgs>(args: SelectSubset<T, SpaStaffAvailabilityUpdateArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaStaffAvailabilities.
     * @param {SpaStaffAvailabilityDeleteManyArgs} args - Arguments to filter SpaStaffAvailabilities to delete.
     * @example
     * // Delete a few SpaStaffAvailabilities
     * const { count } = await prisma.spaStaffAvailability.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaStaffAvailabilityDeleteManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffAvailabilities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaStaffAvailabilities
     * const spaStaffAvailability = await prisma.spaStaffAvailability.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaStaffAvailabilityUpdateManyArgs>(args: SelectSubset<T, SpaStaffAvailabilityUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffAvailabilities and returns the data updated in the database.
     * @param {SpaStaffAvailabilityUpdateManyAndReturnArgs} args - Arguments to update many SpaStaffAvailabilities.
     * @example
     * // Update many SpaStaffAvailabilities
     * const spaStaffAvailability = await prisma.spaStaffAvailability.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaStaffAvailabilities and only return the `id`
     * const spaStaffAvailabilityWithIdOnly = await prisma.spaStaffAvailability.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaStaffAvailabilityUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaStaffAvailabilityUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaStaffAvailability.
     * @param {SpaStaffAvailabilityUpsertArgs} args - Arguments to update or create a SpaStaffAvailability.
     * @example
     * // Update or create a SpaStaffAvailability
     * const spaStaffAvailability = await prisma.spaStaffAvailability.upsert({
     *   create: {
     *     // ... data to create a SpaStaffAvailability
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaStaffAvailability we want to update
     *   }
     * })
     */
    upsert<T extends SpaStaffAvailabilityUpsertArgs>(args: SelectSubset<T, SpaStaffAvailabilityUpsertArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaStaffAvailabilities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityCountArgs} args - Arguments to filter SpaStaffAvailabilities to count.
     * @example
     * // Count the number of SpaStaffAvailabilities
     * const count = await prisma.spaStaffAvailability.count({
     *   where: {
     *     // ... the filter for the SpaStaffAvailabilities we want to count
     *   }
     * })
    **/
    count<T extends SpaStaffAvailabilityCountArgs>(
      args?: Subset<T, SpaStaffAvailabilityCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaStaffAvailabilityCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaStaffAvailability.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaStaffAvailabilityAggregateArgs>(args: Subset<T, SpaStaffAvailabilityAggregateArgs>): Prisma.PrismaPromise<GetSpaStaffAvailabilityAggregateType<T>>

    /**
     * Group by SpaStaffAvailability.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaStaffAvailabilityGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaStaffAvailabilityGroupByArgs['orderBy'] }
        : { orderBy?: SpaStaffAvailabilityGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaStaffAvailabilityGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaStaffAvailabilityGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaStaffAvailability model
   */
  readonly fields: SpaStaffAvailabilityFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaStaffAvailability.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaStaffAvailabilityClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaStaffAvailability model
   */
  interface SpaStaffAvailabilityFieldRefs {
    readonly id: FieldRef<"SpaStaffAvailability", 'String'>
    readonly storeId: FieldRef<"SpaStaffAvailability", 'String'>
    readonly staffId: FieldRef<"SpaStaffAvailability", 'String'>
    readonly dayOfWeek: FieldRef<"SpaStaffAvailability", 'Int'>
    readonly startTime: FieldRef<"SpaStaffAvailability", 'String'>
    readonly endTime: FieldRef<"SpaStaffAvailability", 'String'>
    readonly isActive: FieldRef<"SpaStaffAvailability", 'Boolean'>
  }
    

  // Custom InputTypes
  /**
   * SpaStaffAvailability findUnique
   */
  export type SpaStaffAvailabilityFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailability to fetch.
     */
    where: SpaStaffAvailabilityWhereUniqueInput
  }

  /**
   * SpaStaffAvailability findUniqueOrThrow
   */
  export type SpaStaffAvailabilityFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailability to fetch.
     */
    where: SpaStaffAvailabilityWhereUniqueInput
  }

  /**
   * SpaStaffAvailability findFirst
   */
  export type SpaStaffAvailabilityFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailability to fetch.
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilities to fetch.
     */
    orderBy?: SpaStaffAvailabilityOrderByWithRelationInput | SpaStaffAvailabilityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffAvailabilities.
     */
    cursor?: SpaStaffAvailabilityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffAvailabilities.
     */
    distinct?: SpaStaffAvailabilityScalarFieldEnum | SpaStaffAvailabilityScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailability findFirstOrThrow
   */
  export type SpaStaffAvailabilityFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailability to fetch.
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilities to fetch.
     */
    orderBy?: SpaStaffAvailabilityOrderByWithRelationInput | SpaStaffAvailabilityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffAvailabilities.
     */
    cursor?: SpaStaffAvailabilityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffAvailabilities.
     */
    distinct?: SpaStaffAvailabilityScalarFieldEnum | SpaStaffAvailabilityScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailability findMany
   */
  export type SpaStaffAvailabilityFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilities to fetch.
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilities to fetch.
     */
    orderBy?: SpaStaffAvailabilityOrderByWithRelationInput | SpaStaffAvailabilityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaStaffAvailabilities.
     */
    cursor?: SpaStaffAvailabilityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilities.
     */
    skip?: number
    distinct?: SpaStaffAvailabilityScalarFieldEnum | SpaStaffAvailabilityScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailability create
   */
  export type SpaStaffAvailabilityCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * The data needed to create a SpaStaffAvailability.
     */
    data: XOR<SpaStaffAvailabilityCreateInput, SpaStaffAvailabilityUncheckedCreateInput>
  }

  /**
   * SpaStaffAvailability createMany
   */
  export type SpaStaffAvailabilityCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaStaffAvailabilities.
     */
    data: SpaStaffAvailabilityCreateManyInput | SpaStaffAvailabilityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaStaffAvailability createManyAndReturn
   */
  export type SpaStaffAvailabilityCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * The data used to create many SpaStaffAvailabilities.
     */
    data: SpaStaffAvailabilityCreateManyInput | SpaStaffAvailabilityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaStaffAvailability update
   */
  export type SpaStaffAvailabilityUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * The data needed to update a SpaStaffAvailability.
     */
    data: XOR<SpaStaffAvailabilityUpdateInput, SpaStaffAvailabilityUncheckedUpdateInput>
    /**
     * Choose, which SpaStaffAvailability to update.
     */
    where: SpaStaffAvailabilityWhereUniqueInput
  }

  /**
   * SpaStaffAvailability updateMany
   */
  export type SpaStaffAvailabilityUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaStaffAvailabilities.
     */
    data: XOR<SpaStaffAvailabilityUpdateManyMutationInput, SpaStaffAvailabilityUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffAvailabilities to update
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * Limit how many SpaStaffAvailabilities to update.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailability updateManyAndReturn
   */
  export type SpaStaffAvailabilityUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * The data used to update SpaStaffAvailabilities.
     */
    data: XOR<SpaStaffAvailabilityUpdateManyMutationInput, SpaStaffAvailabilityUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffAvailabilities to update
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * Limit how many SpaStaffAvailabilities to update.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailability upsert
   */
  export type SpaStaffAvailabilityUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * The filter to search for the SpaStaffAvailability to update in case it exists.
     */
    where: SpaStaffAvailabilityWhereUniqueInput
    /**
     * In case the SpaStaffAvailability found by the `where` argument doesn't exist, create a new SpaStaffAvailability with this data.
     */
    create: XOR<SpaStaffAvailabilityCreateInput, SpaStaffAvailabilityUncheckedCreateInput>
    /**
     * In case the SpaStaffAvailability was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaStaffAvailabilityUpdateInput, SpaStaffAvailabilityUncheckedUpdateInput>
  }

  /**
   * SpaStaffAvailability delete
   */
  export type SpaStaffAvailabilityDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
    /**
     * Filter which SpaStaffAvailability to delete.
     */
    where: SpaStaffAvailabilityWhereUniqueInput
  }

  /**
   * SpaStaffAvailability deleteMany
   */
  export type SpaStaffAvailabilityDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffAvailabilities to delete
     */
    where?: SpaStaffAvailabilityWhereInput
    /**
     * Limit how many SpaStaffAvailabilities to delete.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailability without action
   */
  export type SpaStaffAvailabilityDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailability
     */
    select?: SpaStaffAvailabilitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailability
     */
    omit?: SpaStaffAvailabilityOmit<ExtArgs> | null
  }


  /**
   * Model SpaStaffAvailabilityException
   */

  export type AggregateSpaStaffAvailabilityException = {
    _count: SpaStaffAvailabilityExceptionCountAggregateOutputType | null
    _min: SpaStaffAvailabilityExceptionMinAggregateOutputType | null
    _max: SpaStaffAvailabilityExceptionMaxAggregateOutputType | null
  }

  export type SpaStaffAvailabilityExceptionMinAggregateOutputType = {
    id: string | null
    storeId: string | null
    staffId: string | null
    date: Date | null
    type: $Enums.SpaAvailabilityExceptionType | null
    startTime: string | null
    endTime: string | null
    reason: string | null
  }

  export type SpaStaffAvailabilityExceptionMaxAggregateOutputType = {
    id: string | null
    storeId: string | null
    staffId: string | null
    date: Date | null
    type: $Enums.SpaAvailabilityExceptionType | null
    startTime: string | null
    endTime: string | null
    reason: string | null
  }

  export type SpaStaffAvailabilityExceptionCountAggregateOutputType = {
    id: number
    storeId: number
    staffId: number
    date: number
    type: number
    startTime: number
    endTime: number
    reason: number
    _all: number
  }


  export type SpaStaffAvailabilityExceptionMinAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    date?: true
    type?: true
    startTime?: true
    endTime?: true
    reason?: true
  }

  export type SpaStaffAvailabilityExceptionMaxAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    date?: true
    type?: true
    startTime?: true
    endTime?: true
    reason?: true
  }

  export type SpaStaffAvailabilityExceptionCountAggregateInputType = {
    id?: true
    storeId?: true
    staffId?: true
    date?: true
    type?: true
    startTime?: true
    endTime?: true
    reason?: true
    _all?: true
  }

  export type SpaStaffAvailabilityExceptionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffAvailabilityException to aggregate.
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilityExceptions to fetch.
     */
    orderBy?: SpaStaffAvailabilityExceptionOrderByWithRelationInput | SpaStaffAvailabilityExceptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SpaStaffAvailabilityExceptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilityExceptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilityExceptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SpaStaffAvailabilityExceptions
    **/
    _count?: true | SpaStaffAvailabilityExceptionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SpaStaffAvailabilityExceptionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SpaStaffAvailabilityExceptionMaxAggregateInputType
  }

  export type GetSpaStaffAvailabilityExceptionAggregateType<T extends SpaStaffAvailabilityExceptionAggregateArgs> = {
        [P in keyof T & keyof AggregateSpaStaffAvailabilityException]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSpaStaffAvailabilityException[P]>
      : GetScalarType<T[P], AggregateSpaStaffAvailabilityException[P]>
  }




  export type SpaStaffAvailabilityExceptionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SpaStaffAvailabilityExceptionWhereInput
    orderBy?: SpaStaffAvailabilityExceptionOrderByWithAggregationInput | SpaStaffAvailabilityExceptionOrderByWithAggregationInput[]
    by: SpaStaffAvailabilityExceptionScalarFieldEnum[] | SpaStaffAvailabilityExceptionScalarFieldEnum
    having?: SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SpaStaffAvailabilityExceptionCountAggregateInputType | true
    _min?: SpaStaffAvailabilityExceptionMinAggregateInputType
    _max?: SpaStaffAvailabilityExceptionMaxAggregateInputType
  }

  export type SpaStaffAvailabilityExceptionGroupByOutputType = {
    id: string
    storeId: string
    staffId: string
    date: Date
    type: $Enums.SpaAvailabilityExceptionType
    startTime: string | null
    endTime: string | null
    reason: string | null
    _count: SpaStaffAvailabilityExceptionCountAggregateOutputType | null
    _min: SpaStaffAvailabilityExceptionMinAggregateOutputType | null
    _max: SpaStaffAvailabilityExceptionMaxAggregateOutputType | null
  }

  type GetSpaStaffAvailabilityExceptionGroupByPayload<T extends SpaStaffAvailabilityExceptionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SpaStaffAvailabilityExceptionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SpaStaffAvailabilityExceptionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SpaStaffAvailabilityExceptionGroupByOutputType[P]>
            : GetScalarType<T[P], SpaStaffAvailabilityExceptionGroupByOutputType[P]>
        }
      >
    >


  export type SpaStaffAvailabilityExceptionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    date?: boolean
    type?: boolean
    startTime?: boolean
    endTime?: boolean
    reason?: boolean
  }, ExtArgs["result"]["spaStaffAvailabilityException"]>

  export type SpaStaffAvailabilityExceptionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    date?: boolean
    type?: boolean
    startTime?: boolean
    endTime?: boolean
    reason?: boolean
  }, ExtArgs["result"]["spaStaffAvailabilityException"]>

  export type SpaStaffAvailabilityExceptionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    date?: boolean
    type?: boolean
    startTime?: boolean
    endTime?: boolean
    reason?: boolean
  }, ExtArgs["result"]["spaStaffAvailabilityException"]>

  export type SpaStaffAvailabilityExceptionSelectScalar = {
    id?: boolean
    storeId?: boolean
    staffId?: boolean
    date?: boolean
    type?: boolean
    startTime?: boolean
    endTime?: boolean
    reason?: boolean
  }

  export type SpaStaffAvailabilityExceptionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "storeId" | "staffId" | "date" | "type" | "startTime" | "endTime" | "reason", ExtArgs["result"]["spaStaffAvailabilityException"]>

  export type $SpaStaffAvailabilityExceptionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SpaStaffAvailabilityException"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      storeId: string
      staffId: string
      date: Date
      type: $Enums.SpaAvailabilityExceptionType
      startTime: string | null
      endTime: string | null
      reason: string | null
    }, ExtArgs["result"]["spaStaffAvailabilityException"]>
    composites: {}
  }

  type SpaStaffAvailabilityExceptionGetPayload<S extends boolean | null | undefined | SpaStaffAvailabilityExceptionDefaultArgs> = $Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload, S>

  type SpaStaffAvailabilityExceptionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SpaStaffAvailabilityExceptionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SpaStaffAvailabilityExceptionCountAggregateInputType | true
    }

  export interface SpaStaffAvailabilityExceptionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SpaStaffAvailabilityException'], meta: { name: 'SpaStaffAvailabilityException' } }
    /**
     * Find zero or one SpaStaffAvailabilityException that matches the filter.
     * @param {SpaStaffAvailabilityExceptionFindUniqueArgs} args - Arguments to find a SpaStaffAvailabilityException
     * @example
     * // Get one SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SpaStaffAvailabilityExceptionFindUniqueArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionFindUniqueArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SpaStaffAvailabilityException that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SpaStaffAvailabilityExceptionFindUniqueOrThrowArgs} args - Arguments to find a SpaStaffAvailabilityException
     * @example
     * // Get one SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SpaStaffAvailabilityExceptionFindUniqueOrThrowArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffAvailabilityException that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionFindFirstArgs} args - Arguments to find a SpaStaffAvailabilityException
     * @example
     * // Get one SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SpaStaffAvailabilityExceptionFindFirstArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionFindFirstArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SpaStaffAvailabilityException that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionFindFirstOrThrowArgs} args - Arguments to find a SpaStaffAvailabilityException
     * @example
     * // Get one SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SpaStaffAvailabilityExceptionFindFirstOrThrowArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionFindFirstOrThrowArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SpaStaffAvailabilityExceptions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityExceptions = await prisma.spaStaffAvailabilityException.findMany()
     * 
     * // Get first 10 SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityExceptions = await prisma.spaStaffAvailabilityException.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const spaStaffAvailabilityExceptionWithIdOnly = await prisma.spaStaffAvailabilityException.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SpaStaffAvailabilityExceptionFindManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SpaStaffAvailabilityException.
     * @param {SpaStaffAvailabilityExceptionCreateArgs} args - Arguments to create a SpaStaffAvailabilityException.
     * @example
     * // Create one SpaStaffAvailabilityException
     * const SpaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.create({
     *   data: {
     *     // ... data to create a SpaStaffAvailabilityException
     *   }
     * })
     * 
     */
    create<T extends SpaStaffAvailabilityExceptionCreateArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionCreateArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SpaStaffAvailabilityExceptions.
     * @param {SpaStaffAvailabilityExceptionCreateManyArgs} args - Arguments to create many SpaStaffAvailabilityExceptions.
     * @example
     * // Create many SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SpaStaffAvailabilityExceptionCreateManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SpaStaffAvailabilityExceptions and returns the data saved in the database.
     * @param {SpaStaffAvailabilityExceptionCreateManyAndReturnArgs} args - Arguments to create many SpaStaffAvailabilityExceptions.
     * @example
     * // Create many SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SpaStaffAvailabilityExceptions and only return the `id`
     * const spaStaffAvailabilityExceptionWithIdOnly = await prisma.spaStaffAvailabilityException.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SpaStaffAvailabilityExceptionCreateManyAndReturnArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SpaStaffAvailabilityException.
     * @param {SpaStaffAvailabilityExceptionDeleteArgs} args - Arguments to delete one SpaStaffAvailabilityException.
     * @example
     * // Delete one SpaStaffAvailabilityException
     * const SpaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.delete({
     *   where: {
     *     // ... filter to delete one SpaStaffAvailabilityException
     *   }
     * })
     * 
     */
    delete<T extends SpaStaffAvailabilityExceptionDeleteArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionDeleteArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SpaStaffAvailabilityException.
     * @param {SpaStaffAvailabilityExceptionUpdateArgs} args - Arguments to update one SpaStaffAvailabilityException.
     * @example
     * // Update one SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SpaStaffAvailabilityExceptionUpdateArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionUpdateArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SpaStaffAvailabilityExceptions.
     * @param {SpaStaffAvailabilityExceptionDeleteManyArgs} args - Arguments to filter SpaStaffAvailabilityExceptions to delete.
     * @example
     * // Delete a few SpaStaffAvailabilityExceptions
     * const { count } = await prisma.spaStaffAvailabilityException.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SpaStaffAvailabilityExceptionDeleteManyArgs>(args?: SelectSubset<T, SpaStaffAvailabilityExceptionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffAvailabilityExceptions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SpaStaffAvailabilityExceptionUpdateManyArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SpaStaffAvailabilityExceptions and returns the data updated in the database.
     * @param {SpaStaffAvailabilityExceptionUpdateManyAndReturnArgs} args - Arguments to update many SpaStaffAvailabilityExceptions.
     * @example
     * // Update many SpaStaffAvailabilityExceptions
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SpaStaffAvailabilityExceptions and only return the `id`
     * const spaStaffAvailabilityExceptionWithIdOnly = await prisma.spaStaffAvailabilityException.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SpaStaffAvailabilityExceptionUpdateManyAndReturnArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SpaStaffAvailabilityException.
     * @param {SpaStaffAvailabilityExceptionUpsertArgs} args - Arguments to update or create a SpaStaffAvailabilityException.
     * @example
     * // Update or create a SpaStaffAvailabilityException
     * const spaStaffAvailabilityException = await prisma.spaStaffAvailabilityException.upsert({
     *   create: {
     *     // ... data to create a SpaStaffAvailabilityException
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SpaStaffAvailabilityException we want to update
     *   }
     * })
     */
    upsert<T extends SpaStaffAvailabilityExceptionUpsertArgs>(args: SelectSubset<T, SpaStaffAvailabilityExceptionUpsertArgs<ExtArgs>>): Prisma__SpaStaffAvailabilityExceptionClient<$Result.GetResult<Prisma.$SpaStaffAvailabilityExceptionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SpaStaffAvailabilityExceptions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionCountArgs} args - Arguments to filter SpaStaffAvailabilityExceptions to count.
     * @example
     * // Count the number of SpaStaffAvailabilityExceptions
     * const count = await prisma.spaStaffAvailabilityException.count({
     *   where: {
     *     // ... the filter for the SpaStaffAvailabilityExceptions we want to count
     *   }
     * })
    **/
    count<T extends SpaStaffAvailabilityExceptionCountArgs>(
      args?: Subset<T, SpaStaffAvailabilityExceptionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SpaStaffAvailabilityExceptionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SpaStaffAvailabilityException.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SpaStaffAvailabilityExceptionAggregateArgs>(args: Subset<T, SpaStaffAvailabilityExceptionAggregateArgs>): Prisma.PrismaPromise<GetSpaStaffAvailabilityExceptionAggregateType<T>>

    /**
     * Group by SpaStaffAvailabilityException.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SpaStaffAvailabilityExceptionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SpaStaffAvailabilityExceptionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SpaStaffAvailabilityExceptionGroupByArgs['orderBy'] }
        : { orderBy?: SpaStaffAvailabilityExceptionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SpaStaffAvailabilityExceptionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSpaStaffAvailabilityExceptionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SpaStaffAvailabilityException model
   */
  readonly fields: SpaStaffAvailabilityExceptionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SpaStaffAvailabilityException.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SpaStaffAvailabilityExceptionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SpaStaffAvailabilityException model
   */
  interface SpaStaffAvailabilityExceptionFieldRefs {
    readonly id: FieldRef<"SpaStaffAvailabilityException", 'String'>
    readonly storeId: FieldRef<"SpaStaffAvailabilityException", 'String'>
    readonly staffId: FieldRef<"SpaStaffAvailabilityException", 'String'>
    readonly date: FieldRef<"SpaStaffAvailabilityException", 'DateTime'>
    readonly type: FieldRef<"SpaStaffAvailabilityException", 'SpaAvailabilityExceptionType'>
    readonly startTime: FieldRef<"SpaStaffAvailabilityException", 'String'>
    readonly endTime: FieldRef<"SpaStaffAvailabilityException", 'String'>
    readonly reason: FieldRef<"SpaStaffAvailabilityException", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SpaStaffAvailabilityException findUnique
   */
  export type SpaStaffAvailabilityExceptionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilityException to fetch.
     */
    where: SpaStaffAvailabilityExceptionWhereUniqueInput
  }

  /**
   * SpaStaffAvailabilityException findUniqueOrThrow
   */
  export type SpaStaffAvailabilityExceptionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilityException to fetch.
     */
    where: SpaStaffAvailabilityExceptionWhereUniqueInput
  }

  /**
   * SpaStaffAvailabilityException findFirst
   */
  export type SpaStaffAvailabilityExceptionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilityException to fetch.
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilityExceptions to fetch.
     */
    orderBy?: SpaStaffAvailabilityExceptionOrderByWithRelationInput | SpaStaffAvailabilityExceptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffAvailabilityExceptions.
     */
    cursor?: SpaStaffAvailabilityExceptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilityExceptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilityExceptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffAvailabilityExceptions.
     */
    distinct?: SpaStaffAvailabilityExceptionScalarFieldEnum | SpaStaffAvailabilityExceptionScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailabilityException findFirstOrThrow
   */
  export type SpaStaffAvailabilityExceptionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilityException to fetch.
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilityExceptions to fetch.
     */
    orderBy?: SpaStaffAvailabilityExceptionOrderByWithRelationInput | SpaStaffAvailabilityExceptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SpaStaffAvailabilityExceptions.
     */
    cursor?: SpaStaffAvailabilityExceptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilityExceptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilityExceptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SpaStaffAvailabilityExceptions.
     */
    distinct?: SpaStaffAvailabilityExceptionScalarFieldEnum | SpaStaffAvailabilityExceptionScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailabilityException findMany
   */
  export type SpaStaffAvailabilityExceptionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter, which SpaStaffAvailabilityExceptions to fetch.
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SpaStaffAvailabilityExceptions to fetch.
     */
    orderBy?: SpaStaffAvailabilityExceptionOrderByWithRelationInput | SpaStaffAvailabilityExceptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SpaStaffAvailabilityExceptions.
     */
    cursor?: SpaStaffAvailabilityExceptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SpaStaffAvailabilityExceptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SpaStaffAvailabilityExceptions.
     */
    skip?: number
    distinct?: SpaStaffAvailabilityExceptionScalarFieldEnum | SpaStaffAvailabilityExceptionScalarFieldEnum[]
  }

  /**
   * SpaStaffAvailabilityException create
   */
  export type SpaStaffAvailabilityExceptionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * The data needed to create a SpaStaffAvailabilityException.
     */
    data: XOR<SpaStaffAvailabilityExceptionCreateInput, SpaStaffAvailabilityExceptionUncheckedCreateInput>
  }

  /**
   * SpaStaffAvailabilityException createMany
   */
  export type SpaStaffAvailabilityExceptionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SpaStaffAvailabilityExceptions.
     */
    data: SpaStaffAvailabilityExceptionCreateManyInput | SpaStaffAvailabilityExceptionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaStaffAvailabilityException createManyAndReturn
   */
  export type SpaStaffAvailabilityExceptionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * The data used to create many SpaStaffAvailabilityExceptions.
     */
    data: SpaStaffAvailabilityExceptionCreateManyInput | SpaStaffAvailabilityExceptionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SpaStaffAvailabilityException update
   */
  export type SpaStaffAvailabilityExceptionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * The data needed to update a SpaStaffAvailabilityException.
     */
    data: XOR<SpaStaffAvailabilityExceptionUpdateInput, SpaStaffAvailabilityExceptionUncheckedUpdateInput>
    /**
     * Choose, which SpaStaffAvailabilityException to update.
     */
    where: SpaStaffAvailabilityExceptionWhereUniqueInput
  }

  /**
   * SpaStaffAvailabilityException updateMany
   */
  export type SpaStaffAvailabilityExceptionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SpaStaffAvailabilityExceptions.
     */
    data: XOR<SpaStaffAvailabilityExceptionUpdateManyMutationInput, SpaStaffAvailabilityExceptionUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffAvailabilityExceptions to update
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * Limit how many SpaStaffAvailabilityExceptions to update.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailabilityException updateManyAndReturn
   */
  export type SpaStaffAvailabilityExceptionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * The data used to update SpaStaffAvailabilityExceptions.
     */
    data: XOR<SpaStaffAvailabilityExceptionUpdateManyMutationInput, SpaStaffAvailabilityExceptionUncheckedUpdateManyInput>
    /**
     * Filter which SpaStaffAvailabilityExceptions to update
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * Limit how many SpaStaffAvailabilityExceptions to update.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailabilityException upsert
   */
  export type SpaStaffAvailabilityExceptionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * The filter to search for the SpaStaffAvailabilityException to update in case it exists.
     */
    where: SpaStaffAvailabilityExceptionWhereUniqueInput
    /**
     * In case the SpaStaffAvailabilityException found by the `where` argument doesn't exist, create a new SpaStaffAvailabilityException with this data.
     */
    create: XOR<SpaStaffAvailabilityExceptionCreateInput, SpaStaffAvailabilityExceptionUncheckedCreateInput>
    /**
     * In case the SpaStaffAvailabilityException was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SpaStaffAvailabilityExceptionUpdateInput, SpaStaffAvailabilityExceptionUncheckedUpdateInput>
  }

  /**
   * SpaStaffAvailabilityException delete
   */
  export type SpaStaffAvailabilityExceptionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
    /**
     * Filter which SpaStaffAvailabilityException to delete.
     */
    where: SpaStaffAvailabilityExceptionWhereUniqueInput
  }

  /**
   * SpaStaffAvailabilityException deleteMany
   */
  export type SpaStaffAvailabilityExceptionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SpaStaffAvailabilityExceptions to delete
     */
    where?: SpaStaffAvailabilityExceptionWhereInput
    /**
     * Limit how many SpaStaffAvailabilityExceptions to delete.
     */
    limit?: number
  }

  /**
   * SpaStaffAvailabilityException without action
   */
  export type SpaStaffAvailabilityExceptionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SpaStaffAvailabilityException
     */
    select?: SpaStaffAvailabilityExceptionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SpaStaffAvailabilityException
     */
    omit?: SpaStaffAvailabilityExceptionOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const SpaBookingScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    customerId: 'customerId',
    serviceStaffId: 'serviceStaffId',
    bookingDate: 'bookingDate',
    startTime: 'startTime',
    endTime: 'endTime',
    status: 'status',
    serviceNameSnapshot: 'serviceNameSnapshot',
    totalPriceSnapshot: 'totalPriceSnapshot',
    requestKey: 'requestKey',
    notes: 'notes',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SpaBookingScalarFieldEnum = (typeof SpaBookingScalarFieldEnum)[keyof typeof SpaBookingScalarFieldEnum]


  export const SpaBookingItemScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    bookingId: 'bookingId',
    treatmentId: 'treatmentId',
    treatmentNameSnapshot: 'treatmentNameSnapshot',
    priceSnapshot: 'priceSnapshot',
    serviceMinutes: 'serviceMinutes',
    bufferMinutes: 'bufferMinutes',
    sortOrder: 'sortOrder'
  };

  export type SpaBookingItemScalarFieldEnum = (typeof SpaBookingItemScalarFieldEnum)[keyof typeof SpaBookingItemScalarFieldEnum]


  export const SpaTreatmentScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    name: 'name',
    variantLabel: 'variantLabel',
    price: 'price',
    serviceMinutes: 'serviceMinutes',
    bufferMinutes: 'bufferMinutes',
    publicVisible: 'publicVisible',
    isActive: 'isActive',
    sortOrder: 'sortOrder'
  };

  export type SpaTreatmentScalarFieldEnum = (typeof SpaTreatmentScalarFieldEnum)[keyof typeof SpaTreatmentScalarFieldEnum]


  export const SpaSkillScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    name: 'name',
    isActive: 'isActive',
    sortOrder: 'sortOrder'
  };

  export type SpaSkillScalarFieldEnum = (typeof SpaSkillScalarFieldEnum)[keyof typeof SpaSkillScalarFieldEnum]


  export const SpaTreatmentSkillScalarFieldEnum: {
    storeId: 'storeId',
    treatmentId: 'treatmentId',
    skillId: 'skillId'
  };

  export type SpaTreatmentSkillScalarFieldEnum = (typeof SpaTreatmentSkillScalarFieldEnum)[keyof typeof SpaTreatmentSkillScalarFieldEnum]


  export const SpaStaffSkillScalarFieldEnum: {
    storeId: 'storeId',
    staffId: 'staffId',
    skillId: 'skillId'
  };

  export type SpaStaffSkillScalarFieldEnum = (typeof SpaStaffSkillScalarFieldEnum)[keyof typeof SpaStaffSkillScalarFieldEnum]


  export const SpaStaffAvailabilityScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    staffId: 'staffId',
    dayOfWeek: 'dayOfWeek',
    startTime: 'startTime',
    endTime: 'endTime',
    isActive: 'isActive'
  };

  export type SpaStaffAvailabilityScalarFieldEnum = (typeof SpaStaffAvailabilityScalarFieldEnum)[keyof typeof SpaStaffAvailabilityScalarFieldEnum]


  export const SpaStaffAvailabilityExceptionScalarFieldEnum: {
    id: 'id',
    storeId: 'storeId',
    staffId: 'staffId',
    date: 'date',
    type: 'type',
    startTime: 'startTime',
    endTime: 'endTime',
    reason: 'reason'
  };

  export type SpaStaffAvailabilityExceptionScalarFieldEnum = (typeof SpaStaffAvailabilityExceptionScalarFieldEnum)[keyof typeof SpaStaffAvailabilityExceptionScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'SpaBookingStatus'
   */
  export type EnumSpaBookingStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SpaBookingStatus'>
    


  /**
   * Reference to a field of type 'SpaBookingStatus[]'
   */
  export type ListEnumSpaBookingStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SpaBookingStatus[]'>
    


  /**
   * Reference to a field of type 'Decimal'
   */
  export type DecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal'>
    


  /**
   * Reference to a field of type 'Decimal[]'
   */
  export type ListDecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'SpaAvailabilityExceptionType'
   */
  export type EnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SpaAvailabilityExceptionType'>
    


  /**
   * Reference to a field of type 'SpaAvailabilityExceptionType[]'
   */
  export type ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SpaAvailabilityExceptionType[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type SpaBookingWhereInput = {
    AND?: SpaBookingWhereInput | SpaBookingWhereInput[]
    OR?: SpaBookingWhereInput[]
    NOT?: SpaBookingWhereInput | SpaBookingWhereInput[]
    id?: StringFilter<"SpaBooking"> | string
    storeId?: StringFilter<"SpaBooking"> | string
    customerId?: StringFilter<"SpaBooking"> | string
    serviceStaffId?: StringFilter<"SpaBooking"> | string
    bookingDate?: DateTimeFilter<"SpaBooking"> | Date | string
    startTime?: StringFilter<"SpaBooking"> | string
    endTime?: StringFilter<"SpaBooking"> | string
    status?: EnumSpaBookingStatusFilter<"SpaBooking"> | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFilter<"SpaBooking"> | string
    totalPriceSnapshot?: DecimalFilter<"SpaBooking"> | Decimal | DecimalJsLike | number | string
    requestKey?: StringNullableFilter<"SpaBooking"> | string | null
    notes?: StringNullableFilter<"SpaBooking"> | string | null
    createdAt?: DateTimeFilter<"SpaBooking"> | Date | string
    updatedAt?: DateTimeFilter<"SpaBooking"> | Date | string
    items?: SpaBookingItemListRelationFilter
  }

  export type SpaBookingOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    customerId?: SortOrder
    serviceStaffId?: SortOrder
    bookingDate?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    serviceNameSnapshot?: SortOrder
    totalPriceSnapshot?: SortOrder
    requestKey?: SortOrderInput | SortOrder
    notes?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    items?: SpaBookingItemOrderByRelationAggregateInput
  }

  export type SpaBookingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    storeId_requestKey?: SpaBookingStoreIdRequestKeyCompoundUniqueInput
    id_storeId?: SpaBookingIdStoreIdCompoundUniqueInput
    AND?: SpaBookingWhereInput | SpaBookingWhereInput[]
    OR?: SpaBookingWhereInput[]
    NOT?: SpaBookingWhereInput | SpaBookingWhereInput[]
    storeId?: StringFilter<"SpaBooking"> | string
    customerId?: StringFilter<"SpaBooking"> | string
    serviceStaffId?: StringFilter<"SpaBooking"> | string
    bookingDate?: DateTimeFilter<"SpaBooking"> | Date | string
    startTime?: StringFilter<"SpaBooking"> | string
    endTime?: StringFilter<"SpaBooking"> | string
    status?: EnumSpaBookingStatusFilter<"SpaBooking"> | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFilter<"SpaBooking"> | string
    totalPriceSnapshot?: DecimalFilter<"SpaBooking"> | Decimal | DecimalJsLike | number | string
    requestKey?: StringNullableFilter<"SpaBooking"> | string | null
    notes?: StringNullableFilter<"SpaBooking"> | string | null
    createdAt?: DateTimeFilter<"SpaBooking"> | Date | string
    updatedAt?: DateTimeFilter<"SpaBooking"> | Date | string
    items?: SpaBookingItemListRelationFilter
  }, "id" | "storeId_requestKey" | "id_storeId">

  export type SpaBookingOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    customerId?: SortOrder
    serviceStaffId?: SortOrder
    bookingDate?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    serviceNameSnapshot?: SortOrder
    totalPriceSnapshot?: SortOrder
    requestKey?: SortOrderInput | SortOrder
    notes?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SpaBookingCountOrderByAggregateInput
    _avg?: SpaBookingAvgOrderByAggregateInput
    _max?: SpaBookingMaxOrderByAggregateInput
    _min?: SpaBookingMinOrderByAggregateInput
    _sum?: SpaBookingSumOrderByAggregateInput
  }

  export type SpaBookingScalarWhereWithAggregatesInput = {
    AND?: SpaBookingScalarWhereWithAggregatesInput | SpaBookingScalarWhereWithAggregatesInput[]
    OR?: SpaBookingScalarWhereWithAggregatesInput[]
    NOT?: SpaBookingScalarWhereWithAggregatesInput | SpaBookingScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaBooking"> | string
    storeId?: StringWithAggregatesFilter<"SpaBooking"> | string
    customerId?: StringWithAggregatesFilter<"SpaBooking"> | string
    serviceStaffId?: StringWithAggregatesFilter<"SpaBooking"> | string
    bookingDate?: DateTimeWithAggregatesFilter<"SpaBooking"> | Date | string
    startTime?: StringWithAggregatesFilter<"SpaBooking"> | string
    endTime?: StringWithAggregatesFilter<"SpaBooking"> | string
    status?: EnumSpaBookingStatusWithAggregatesFilter<"SpaBooking"> | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringWithAggregatesFilter<"SpaBooking"> | string
    totalPriceSnapshot?: DecimalWithAggregatesFilter<"SpaBooking"> | Decimal | DecimalJsLike | number | string
    requestKey?: StringNullableWithAggregatesFilter<"SpaBooking"> | string | null
    notes?: StringNullableWithAggregatesFilter<"SpaBooking"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"SpaBooking"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SpaBooking"> | Date | string
  }

  export type SpaBookingItemWhereInput = {
    AND?: SpaBookingItemWhereInput | SpaBookingItemWhereInput[]
    OR?: SpaBookingItemWhereInput[]
    NOT?: SpaBookingItemWhereInput | SpaBookingItemWhereInput[]
    id?: StringFilter<"SpaBookingItem"> | string
    storeId?: StringFilter<"SpaBookingItem"> | string
    bookingId?: StringFilter<"SpaBookingItem"> | string
    treatmentId?: StringFilter<"SpaBookingItem"> | string
    treatmentNameSnapshot?: StringFilter<"SpaBookingItem"> | string
    priceSnapshot?: DecimalFilter<"SpaBookingItem"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFilter<"SpaBookingItem"> | number
    bufferMinutes?: IntFilter<"SpaBookingItem"> | number
    sortOrder?: IntFilter<"SpaBookingItem"> | number
    booking?: XOR<SpaBookingScalarRelationFilter, SpaBookingWhereInput>
  }

  export type SpaBookingItemOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    bookingId?: SortOrder
    treatmentId?: SortOrder
    treatmentNameSnapshot?: SortOrder
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
    booking?: SpaBookingOrderByWithRelationInput
  }

  export type SpaBookingItemWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    bookingId_sortOrder?: SpaBookingItemBookingIdSortOrderCompoundUniqueInput
    AND?: SpaBookingItemWhereInput | SpaBookingItemWhereInput[]
    OR?: SpaBookingItemWhereInput[]
    NOT?: SpaBookingItemWhereInput | SpaBookingItemWhereInput[]
    storeId?: StringFilter<"SpaBookingItem"> | string
    bookingId?: StringFilter<"SpaBookingItem"> | string
    treatmentId?: StringFilter<"SpaBookingItem"> | string
    treatmentNameSnapshot?: StringFilter<"SpaBookingItem"> | string
    priceSnapshot?: DecimalFilter<"SpaBookingItem"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFilter<"SpaBookingItem"> | number
    bufferMinutes?: IntFilter<"SpaBookingItem"> | number
    sortOrder?: IntFilter<"SpaBookingItem"> | number
    booking?: XOR<SpaBookingScalarRelationFilter, SpaBookingWhereInput>
  }, "id" | "bookingId_sortOrder">

  export type SpaBookingItemOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    bookingId?: SortOrder
    treatmentId?: SortOrder
    treatmentNameSnapshot?: SortOrder
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
    _count?: SpaBookingItemCountOrderByAggregateInput
    _avg?: SpaBookingItemAvgOrderByAggregateInput
    _max?: SpaBookingItemMaxOrderByAggregateInput
    _min?: SpaBookingItemMinOrderByAggregateInput
    _sum?: SpaBookingItemSumOrderByAggregateInput
  }

  export type SpaBookingItemScalarWhereWithAggregatesInput = {
    AND?: SpaBookingItemScalarWhereWithAggregatesInput | SpaBookingItemScalarWhereWithAggregatesInput[]
    OR?: SpaBookingItemScalarWhereWithAggregatesInput[]
    NOT?: SpaBookingItemScalarWhereWithAggregatesInput | SpaBookingItemScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaBookingItem"> | string
    storeId?: StringWithAggregatesFilter<"SpaBookingItem"> | string
    bookingId?: StringWithAggregatesFilter<"SpaBookingItem"> | string
    treatmentId?: StringWithAggregatesFilter<"SpaBookingItem"> | string
    treatmentNameSnapshot?: StringWithAggregatesFilter<"SpaBookingItem"> | string
    priceSnapshot?: DecimalWithAggregatesFilter<"SpaBookingItem"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntWithAggregatesFilter<"SpaBookingItem"> | number
    bufferMinutes?: IntWithAggregatesFilter<"SpaBookingItem"> | number
    sortOrder?: IntWithAggregatesFilter<"SpaBookingItem"> | number
  }

  export type SpaTreatmentWhereInput = {
    AND?: SpaTreatmentWhereInput | SpaTreatmentWhereInput[]
    OR?: SpaTreatmentWhereInput[]
    NOT?: SpaTreatmentWhereInput | SpaTreatmentWhereInput[]
    id?: StringFilter<"SpaTreatment"> | string
    storeId?: StringFilter<"SpaTreatment"> | string
    name?: StringFilter<"SpaTreatment"> | string
    variantLabel?: StringNullableFilter<"SpaTreatment"> | string | null
    price?: DecimalFilter<"SpaTreatment"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFilter<"SpaTreatment"> | number
    bufferMinutes?: IntFilter<"SpaTreatment"> | number
    publicVisible?: BoolFilter<"SpaTreatment"> | boolean
    isActive?: BoolFilter<"SpaTreatment"> | boolean
    sortOrder?: IntFilter<"SpaTreatment"> | number
    skills?: SpaTreatmentSkillListRelationFilter
  }

  export type SpaTreatmentOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    variantLabel?: SortOrderInput | SortOrder
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    publicVisible?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
    skills?: SpaTreatmentSkillOrderByRelationAggregateInput
  }

  export type SpaTreatmentWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    id_storeId?: SpaTreatmentIdStoreIdCompoundUniqueInput
    storeId_name_variantLabel?: SpaTreatmentStoreIdNameVariantLabelCompoundUniqueInput
    AND?: SpaTreatmentWhereInput | SpaTreatmentWhereInput[]
    OR?: SpaTreatmentWhereInput[]
    NOT?: SpaTreatmentWhereInput | SpaTreatmentWhereInput[]
    storeId?: StringFilter<"SpaTreatment"> | string
    name?: StringFilter<"SpaTreatment"> | string
    variantLabel?: StringNullableFilter<"SpaTreatment"> | string | null
    price?: DecimalFilter<"SpaTreatment"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFilter<"SpaTreatment"> | number
    bufferMinutes?: IntFilter<"SpaTreatment"> | number
    publicVisible?: BoolFilter<"SpaTreatment"> | boolean
    isActive?: BoolFilter<"SpaTreatment"> | boolean
    sortOrder?: IntFilter<"SpaTreatment"> | number
    skills?: SpaTreatmentSkillListRelationFilter
  }, "id" | "id_storeId" | "storeId_name_variantLabel">

  export type SpaTreatmentOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    variantLabel?: SortOrderInput | SortOrder
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    publicVisible?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
    _count?: SpaTreatmentCountOrderByAggregateInput
    _avg?: SpaTreatmentAvgOrderByAggregateInput
    _max?: SpaTreatmentMaxOrderByAggregateInput
    _min?: SpaTreatmentMinOrderByAggregateInput
    _sum?: SpaTreatmentSumOrderByAggregateInput
  }

  export type SpaTreatmentScalarWhereWithAggregatesInput = {
    AND?: SpaTreatmentScalarWhereWithAggregatesInput | SpaTreatmentScalarWhereWithAggregatesInput[]
    OR?: SpaTreatmentScalarWhereWithAggregatesInput[]
    NOT?: SpaTreatmentScalarWhereWithAggregatesInput | SpaTreatmentScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaTreatment"> | string
    storeId?: StringWithAggregatesFilter<"SpaTreatment"> | string
    name?: StringWithAggregatesFilter<"SpaTreatment"> | string
    variantLabel?: StringNullableWithAggregatesFilter<"SpaTreatment"> | string | null
    price?: DecimalWithAggregatesFilter<"SpaTreatment"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntWithAggregatesFilter<"SpaTreatment"> | number
    bufferMinutes?: IntWithAggregatesFilter<"SpaTreatment"> | number
    publicVisible?: BoolWithAggregatesFilter<"SpaTreatment"> | boolean
    isActive?: BoolWithAggregatesFilter<"SpaTreatment"> | boolean
    sortOrder?: IntWithAggregatesFilter<"SpaTreatment"> | number
  }

  export type SpaSkillWhereInput = {
    AND?: SpaSkillWhereInput | SpaSkillWhereInput[]
    OR?: SpaSkillWhereInput[]
    NOT?: SpaSkillWhereInput | SpaSkillWhereInput[]
    id?: StringFilter<"SpaSkill"> | string
    storeId?: StringFilter<"SpaSkill"> | string
    name?: StringFilter<"SpaSkill"> | string
    isActive?: BoolFilter<"SpaSkill"> | boolean
    sortOrder?: IntFilter<"SpaSkill"> | number
    treatments?: SpaTreatmentSkillListRelationFilter
    staff?: SpaStaffSkillListRelationFilter
  }

  export type SpaSkillOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
    treatments?: SpaTreatmentSkillOrderByRelationAggregateInput
    staff?: SpaStaffSkillOrderByRelationAggregateInput
  }

  export type SpaSkillWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    id_storeId?: SpaSkillIdStoreIdCompoundUniqueInput
    storeId_name?: SpaSkillStoreIdNameCompoundUniqueInput
    AND?: SpaSkillWhereInput | SpaSkillWhereInput[]
    OR?: SpaSkillWhereInput[]
    NOT?: SpaSkillWhereInput | SpaSkillWhereInput[]
    storeId?: StringFilter<"SpaSkill"> | string
    name?: StringFilter<"SpaSkill"> | string
    isActive?: BoolFilter<"SpaSkill"> | boolean
    sortOrder?: IntFilter<"SpaSkill"> | number
    treatments?: SpaTreatmentSkillListRelationFilter
    staff?: SpaStaffSkillListRelationFilter
  }, "id" | "id_storeId" | "storeId_name">

  export type SpaSkillOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
    _count?: SpaSkillCountOrderByAggregateInput
    _avg?: SpaSkillAvgOrderByAggregateInput
    _max?: SpaSkillMaxOrderByAggregateInput
    _min?: SpaSkillMinOrderByAggregateInput
    _sum?: SpaSkillSumOrderByAggregateInput
  }

  export type SpaSkillScalarWhereWithAggregatesInput = {
    AND?: SpaSkillScalarWhereWithAggregatesInput | SpaSkillScalarWhereWithAggregatesInput[]
    OR?: SpaSkillScalarWhereWithAggregatesInput[]
    NOT?: SpaSkillScalarWhereWithAggregatesInput | SpaSkillScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaSkill"> | string
    storeId?: StringWithAggregatesFilter<"SpaSkill"> | string
    name?: StringWithAggregatesFilter<"SpaSkill"> | string
    isActive?: BoolWithAggregatesFilter<"SpaSkill"> | boolean
    sortOrder?: IntWithAggregatesFilter<"SpaSkill"> | number
  }

  export type SpaTreatmentSkillWhereInput = {
    AND?: SpaTreatmentSkillWhereInput | SpaTreatmentSkillWhereInput[]
    OR?: SpaTreatmentSkillWhereInput[]
    NOT?: SpaTreatmentSkillWhereInput | SpaTreatmentSkillWhereInput[]
    storeId?: StringFilter<"SpaTreatmentSkill"> | string
    treatmentId?: StringFilter<"SpaTreatmentSkill"> | string
    skillId?: StringFilter<"SpaTreatmentSkill"> | string
    treatment?: XOR<SpaTreatmentScalarRelationFilter, SpaTreatmentWhereInput>
    skill?: XOR<SpaSkillScalarRelationFilter, SpaSkillWhereInput>
  }

  export type SpaTreatmentSkillOrderByWithRelationInput = {
    storeId?: SortOrder
    treatmentId?: SortOrder
    skillId?: SortOrder
    treatment?: SpaTreatmentOrderByWithRelationInput
    skill?: SpaSkillOrderByWithRelationInput
  }

  export type SpaTreatmentSkillWhereUniqueInput = Prisma.AtLeast<{
    treatmentId_skillId?: SpaTreatmentSkillTreatmentIdSkillIdCompoundUniqueInput
    AND?: SpaTreatmentSkillWhereInput | SpaTreatmentSkillWhereInput[]
    OR?: SpaTreatmentSkillWhereInput[]
    NOT?: SpaTreatmentSkillWhereInput | SpaTreatmentSkillWhereInput[]
    storeId?: StringFilter<"SpaTreatmentSkill"> | string
    treatmentId?: StringFilter<"SpaTreatmentSkill"> | string
    skillId?: StringFilter<"SpaTreatmentSkill"> | string
    treatment?: XOR<SpaTreatmentScalarRelationFilter, SpaTreatmentWhereInput>
    skill?: XOR<SpaSkillScalarRelationFilter, SpaSkillWhereInput>
  }, "treatmentId_skillId">

  export type SpaTreatmentSkillOrderByWithAggregationInput = {
    storeId?: SortOrder
    treatmentId?: SortOrder
    skillId?: SortOrder
    _count?: SpaTreatmentSkillCountOrderByAggregateInput
    _max?: SpaTreatmentSkillMaxOrderByAggregateInput
    _min?: SpaTreatmentSkillMinOrderByAggregateInput
  }

  export type SpaTreatmentSkillScalarWhereWithAggregatesInput = {
    AND?: SpaTreatmentSkillScalarWhereWithAggregatesInput | SpaTreatmentSkillScalarWhereWithAggregatesInput[]
    OR?: SpaTreatmentSkillScalarWhereWithAggregatesInput[]
    NOT?: SpaTreatmentSkillScalarWhereWithAggregatesInput | SpaTreatmentSkillScalarWhereWithAggregatesInput[]
    storeId?: StringWithAggregatesFilter<"SpaTreatmentSkill"> | string
    treatmentId?: StringWithAggregatesFilter<"SpaTreatmentSkill"> | string
    skillId?: StringWithAggregatesFilter<"SpaTreatmentSkill"> | string
  }

  export type SpaStaffSkillWhereInput = {
    AND?: SpaStaffSkillWhereInput | SpaStaffSkillWhereInput[]
    OR?: SpaStaffSkillWhereInput[]
    NOT?: SpaStaffSkillWhereInput | SpaStaffSkillWhereInput[]
    storeId?: StringFilter<"SpaStaffSkill"> | string
    staffId?: StringFilter<"SpaStaffSkill"> | string
    skillId?: StringFilter<"SpaStaffSkill"> | string
    skill?: XOR<SpaSkillScalarRelationFilter, SpaSkillWhereInput>
  }

  export type SpaStaffSkillOrderByWithRelationInput = {
    storeId?: SortOrder
    staffId?: SortOrder
    skillId?: SortOrder
    skill?: SpaSkillOrderByWithRelationInput
  }

  export type SpaStaffSkillWhereUniqueInput = Prisma.AtLeast<{
    staffId_skillId?: SpaStaffSkillStaffIdSkillIdCompoundUniqueInput
    AND?: SpaStaffSkillWhereInput | SpaStaffSkillWhereInput[]
    OR?: SpaStaffSkillWhereInput[]
    NOT?: SpaStaffSkillWhereInput | SpaStaffSkillWhereInput[]
    storeId?: StringFilter<"SpaStaffSkill"> | string
    staffId?: StringFilter<"SpaStaffSkill"> | string
    skillId?: StringFilter<"SpaStaffSkill"> | string
    skill?: XOR<SpaSkillScalarRelationFilter, SpaSkillWhereInput>
  }, "staffId_skillId">

  export type SpaStaffSkillOrderByWithAggregationInput = {
    storeId?: SortOrder
    staffId?: SortOrder
    skillId?: SortOrder
    _count?: SpaStaffSkillCountOrderByAggregateInput
    _max?: SpaStaffSkillMaxOrderByAggregateInput
    _min?: SpaStaffSkillMinOrderByAggregateInput
  }

  export type SpaStaffSkillScalarWhereWithAggregatesInput = {
    AND?: SpaStaffSkillScalarWhereWithAggregatesInput | SpaStaffSkillScalarWhereWithAggregatesInput[]
    OR?: SpaStaffSkillScalarWhereWithAggregatesInput[]
    NOT?: SpaStaffSkillScalarWhereWithAggregatesInput | SpaStaffSkillScalarWhereWithAggregatesInput[]
    storeId?: StringWithAggregatesFilter<"SpaStaffSkill"> | string
    staffId?: StringWithAggregatesFilter<"SpaStaffSkill"> | string
    skillId?: StringWithAggregatesFilter<"SpaStaffSkill"> | string
  }

  export type SpaStaffAvailabilityWhereInput = {
    AND?: SpaStaffAvailabilityWhereInput | SpaStaffAvailabilityWhereInput[]
    OR?: SpaStaffAvailabilityWhereInput[]
    NOT?: SpaStaffAvailabilityWhereInput | SpaStaffAvailabilityWhereInput[]
    id?: StringFilter<"SpaStaffAvailability"> | string
    storeId?: StringFilter<"SpaStaffAvailability"> | string
    staffId?: StringFilter<"SpaStaffAvailability"> | string
    dayOfWeek?: IntFilter<"SpaStaffAvailability"> | number
    startTime?: StringFilter<"SpaStaffAvailability"> | string
    endTime?: StringFilter<"SpaStaffAvailability"> | string
    isActive?: BoolFilter<"SpaStaffAvailability"> | boolean
  }

  export type SpaStaffAvailabilityOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    dayOfWeek?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    isActive?: SortOrder
  }

  export type SpaStaffAvailabilityWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    storeId_staffId_dayOfWeek?: SpaStaffAvailabilityStoreIdStaffIdDayOfWeekCompoundUniqueInput
    AND?: SpaStaffAvailabilityWhereInput | SpaStaffAvailabilityWhereInput[]
    OR?: SpaStaffAvailabilityWhereInput[]
    NOT?: SpaStaffAvailabilityWhereInput | SpaStaffAvailabilityWhereInput[]
    storeId?: StringFilter<"SpaStaffAvailability"> | string
    staffId?: StringFilter<"SpaStaffAvailability"> | string
    dayOfWeek?: IntFilter<"SpaStaffAvailability"> | number
    startTime?: StringFilter<"SpaStaffAvailability"> | string
    endTime?: StringFilter<"SpaStaffAvailability"> | string
    isActive?: BoolFilter<"SpaStaffAvailability"> | boolean
  }, "id" | "storeId_staffId_dayOfWeek">

  export type SpaStaffAvailabilityOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    dayOfWeek?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    isActive?: SortOrder
    _count?: SpaStaffAvailabilityCountOrderByAggregateInput
    _avg?: SpaStaffAvailabilityAvgOrderByAggregateInput
    _max?: SpaStaffAvailabilityMaxOrderByAggregateInput
    _min?: SpaStaffAvailabilityMinOrderByAggregateInput
    _sum?: SpaStaffAvailabilitySumOrderByAggregateInput
  }

  export type SpaStaffAvailabilityScalarWhereWithAggregatesInput = {
    AND?: SpaStaffAvailabilityScalarWhereWithAggregatesInput | SpaStaffAvailabilityScalarWhereWithAggregatesInput[]
    OR?: SpaStaffAvailabilityScalarWhereWithAggregatesInput[]
    NOT?: SpaStaffAvailabilityScalarWhereWithAggregatesInput | SpaStaffAvailabilityScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaStaffAvailability"> | string
    storeId?: StringWithAggregatesFilter<"SpaStaffAvailability"> | string
    staffId?: StringWithAggregatesFilter<"SpaStaffAvailability"> | string
    dayOfWeek?: IntWithAggregatesFilter<"SpaStaffAvailability"> | number
    startTime?: StringWithAggregatesFilter<"SpaStaffAvailability"> | string
    endTime?: StringWithAggregatesFilter<"SpaStaffAvailability"> | string
    isActive?: BoolWithAggregatesFilter<"SpaStaffAvailability"> | boolean
  }

  export type SpaStaffAvailabilityExceptionWhereInput = {
    AND?: SpaStaffAvailabilityExceptionWhereInput | SpaStaffAvailabilityExceptionWhereInput[]
    OR?: SpaStaffAvailabilityExceptionWhereInput[]
    NOT?: SpaStaffAvailabilityExceptionWhereInput | SpaStaffAvailabilityExceptionWhereInput[]
    id?: StringFilter<"SpaStaffAvailabilityException"> | string
    storeId?: StringFilter<"SpaStaffAvailabilityException"> | string
    staffId?: StringFilter<"SpaStaffAvailabilityException"> | string
    date?: DateTimeFilter<"SpaStaffAvailabilityException"> | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFilter<"SpaStaffAvailabilityException"> | $Enums.SpaAvailabilityExceptionType
    startTime?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
    endTime?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
    reason?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
  }

  export type SpaStaffAvailabilityExceptionOrderByWithRelationInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    date?: SortOrder
    type?: SortOrder
    startTime?: SortOrderInput | SortOrder
    endTime?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
  }

  export type SpaStaffAvailabilityExceptionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SpaStaffAvailabilityExceptionWhereInput | SpaStaffAvailabilityExceptionWhereInput[]
    OR?: SpaStaffAvailabilityExceptionWhereInput[]
    NOT?: SpaStaffAvailabilityExceptionWhereInput | SpaStaffAvailabilityExceptionWhereInput[]
    storeId?: StringFilter<"SpaStaffAvailabilityException"> | string
    staffId?: StringFilter<"SpaStaffAvailabilityException"> | string
    date?: DateTimeFilter<"SpaStaffAvailabilityException"> | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFilter<"SpaStaffAvailabilityException"> | $Enums.SpaAvailabilityExceptionType
    startTime?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
    endTime?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
    reason?: StringNullableFilter<"SpaStaffAvailabilityException"> | string | null
  }, "id">

  export type SpaStaffAvailabilityExceptionOrderByWithAggregationInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    date?: SortOrder
    type?: SortOrder
    startTime?: SortOrderInput | SortOrder
    endTime?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
    _count?: SpaStaffAvailabilityExceptionCountOrderByAggregateInput
    _max?: SpaStaffAvailabilityExceptionMaxOrderByAggregateInput
    _min?: SpaStaffAvailabilityExceptionMinOrderByAggregateInput
  }

  export type SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput = {
    AND?: SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput | SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput[]
    OR?: SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput[]
    NOT?: SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput | SpaStaffAvailabilityExceptionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SpaStaffAvailabilityException"> | string
    storeId?: StringWithAggregatesFilter<"SpaStaffAvailabilityException"> | string
    staffId?: StringWithAggregatesFilter<"SpaStaffAvailabilityException"> | string
    date?: DateTimeWithAggregatesFilter<"SpaStaffAvailabilityException"> | Date | string
    type?: EnumSpaAvailabilityExceptionTypeWithAggregatesFilter<"SpaStaffAvailabilityException"> | $Enums.SpaAvailabilityExceptionType
    startTime?: StringNullableWithAggregatesFilter<"SpaStaffAvailabilityException"> | string | null
    endTime?: StringNullableWithAggregatesFilter<"SpaStaffAvailabilityException"> | string | null
    reason?: StringNullableWithAggregatesFilter<"SpaStaffAvailabilityException"> | string | null
  }

  export type SpaBookingCreateInput = {
    id?: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date | string
    startTime: string
    endTime: string
    status?: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal | DecimalJsLike | number | string
    requestKey?: string | null
    notes?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    items?: SpaBookingItemCreateNestedManyWithoutBookingInput
  }

  export type SpaBookingUncheckedCreateInput = {
    id?: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date | string
    startTime: string
    endTime: string
    status?: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal | DecimalJsLike | number | string
    requestKey?: string | null
    notes?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    items?: SpaBookingItemUncheckedCreateNestedManyWithoutBookingInput
  }

  export type SpaBookingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    items?: SpaBookingItemUpdateManyWithoutBookingNestedInput
  }

  export type SpaBookingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    items?: SpaBookingItemUncheckedUpdateManyWithoutBookingNestedInput
  }

  export type SpaBookingCreateManyInput = {
    id?: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date | string
    startTime: string
    endTime: string
    status?: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal | DecimalJsLike | number | string
    requestKey?: string | null
    notes?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SpaBookingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SpaBookingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SpaBookingItemCreateInput = {
    id?: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
    booking: SpaBookingCreateNestedOneWithoutItemsInput
  }

  export type SpaBookingItemUncheckedCreateInput = {
    id?: string
    storeId: string
    bookingId: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
  }

  export type SpaBookingItemUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
    booking?: SpaBookingUpdateOneRequiredWithoutItemsNestedInput
  }

  export type SpaBookingItemUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    bookingId?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaBookingItemCreateManyInput = {
    id?: string
    storeId: string
    bookingId: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
  }

  export type SpaBookingItemUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaBookingItemUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    bookingId?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaTreatmentCreateInput = {
    id?: string
    storeId: string
    name: string
    variantLabel?: string | null
    price: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: number
    skills?: SpaTreatmentSkillCreateNestedManyWithoutTreatmentInput
  }

  export type SpaTreatmentUncheckedCreateInput = {
    id?: string
    storeId: string
    name: string
    variantLabel?: string | null
    price: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: number
    skills?: SpaTreatmentSkillUncheckedCreateNestedManyWithoutTreatmentInput
  }

  export type SpaTreatmentUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    skills?: SpaTreatmentSkillUpdateManyWithoutTreatmentNestedInput
  }

  export type SpaTreatmentUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    skills?: SpaTreatmentSkillUncheckedUpdateManyWithoutTreatmentNestedInput
  }

  export type SpaTreatmentCreateManyInput = {
    id?: string
    storeId: string
    name: string
    variantLabel?: string | null
    price: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: number
  }

  export type SpaTreatmentUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaTreatmentUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaSkillCreateInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    treatments?: SpaTreatmentSkillCreateNestedManyWithoutSkillInput
    staff?: SpaStaffSkillCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillUncheckedCreateInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    treatments?: SpaTreatmentSkillUncheckedCreateNestedManyWithoutSkillInput
    staff?: SpaStaffSkillUncheckedCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    treatments?: SpaTreatmentSkillUpdateManyWithoutSkillNestedInput
    staff?: SpaStaffSkillUpdateManyWithoutSkillNestedInput
  }

  export type SpaSkillUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    treatments?: SpaTreatmentSkillUncheckedUpdateManyWithoutSkillNestedInput
    staff?: SpaStaffSkillUncheckedUpdateManyWithoutSkillNestedInput
  }

  export type SpaSkillCreateManyInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
  }

  export type SpaSkillUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaSkillUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaTreatmentSkillCreateInput = {
    treatment: SpaTreatmentCreateNestedOneWithoutSkillsInput
    skill: SpaSkillCreateNestedOneWithoutTreatmentsInput
  }

  export type SpaTreatmentSkillUncheckedCreateInput = {
    storeId: string
    treatmentId: string
    skillId: string
  }

  export type SpaTreatmentSkillUpdateInput = {
    treatment?: SpaTreatmentUpdateOneRequiredWithoutSkillsNestedInput
    skill?: SpaSkillUpdateOneRequiredWithoutTreatmentsNestedInput
  }

  export type SpaTreatmentSkillUncheckedUpdateInput = {
    storeId?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaTreatmentSkillCreateManyInput = {
    storeId: string
    treatmentId: string
    skillId: string
  }

  export type SpaTreatmentSkillUpdateManyMutationInput = {

  }

  export type SpaTreatmentSkillUncheckedUpdateManyInput = {
    storeId?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillCreateInput = {
    staffId: string
    skill: SpaSkillCreateNestedOneWithoutStaffInput
  }

  export type SpaStaffSkillUncheckedCreateInput = {
    storeId: string
    staffId: string
    skillId: string
  }

  export type SpaStaffSkillUpdateInput = {
    staffId?: StringFieldUpdateOperationsInput | string
    skill?: SpaSkillUpdateOneRequiredWithoutStaffNestedInput
  }

  export type SpaStaffSkillUncheckedUpdateInput = {
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillCreateManyInput = {
    storeId: string
    staffId: string
    skillId: string
  }

  export type SpaStaffSkillUpdateManyMutationInput = {
    staffId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillUncheckedUpdateManyInput = {
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffAvailabilityCreateInput = {
    id?: string
    storeId: string
    staffId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    isActive?: boolean
  }

  export type SpaStaffAvailabilityUncheckedCreateInput = {
    id?: string
    storeId: string
    staffId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    isActive?: boolean
  }

  export type SpaStaffAvailabilityUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    dayOfWeek?: IntFieldUpdateOperationsInput | number
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
  }

  export type SpaStaffAvailabilityUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    dayOfWeek?: IntFieldUpdateOperationsInput | number
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
  }

  export type SpaStaffAvailabilityCreateManyInput = {
    id?: string
    storeId: string
    staffId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    isActive?: boolean
  }

  export type SpaStaffAvailabilityUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    dayOfWeek?: IntFieldUpdateOperationsInput | number
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
  }

  export type SpaStaffAvailabilityUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    dayOfWeek?: IntFieldUpdateOperationsInput | number
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
  }

  export type SpaStaffAvailabilityExceptionCreateInput = {
    id?: string
    storeId: string
    staffId: string
    date: Date | string
    type: $Enums.SpaAvailabilityExceptionType
    startTime?: string | null
    endTime?: string | null
    reason?: string | null
  }

  export type SpaStaffAvailabilityExceptionUncheckedCreateInput = {
    id?: string
    storeId: string
    staffId: string
    date: Date | string
    type: $Enums.SpaAvailabilityExceptionType
    startTime?: string | null
    endTime?: string | null
    reason?: string | null
  }

  export type SpaStaffAvailabilityExceptionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFieldUpdateOperationsInput | $Enums.SpaAvailabilityExceptionType
    startTime?: NullableStringFieldUpdateOperationsInput | string | null
    endTime?: NullableStringFieldUpdateOperationsInput | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SpaStaffAvailabilityExceptionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFieldUpdateOperationsInput | $Enums.SpaAvailabilityExceptionType
    startTime?: NullableStringFieldUpdateOperationsInput | string | null
    endTime?: NullableStringFieldUpdateOperationsInput | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SpaStaffAvailabilityExceptionCreateManyInput = {
    id?: string
    storeId: string
    staffId: string
    date: Date | string
    type: $Enums.SpaAvailabilityExceptionType
    startTime?: string | null
    endTime?: string | null
    reason?: string | null
  }

  export type SpaStaffAvailabilityExceptionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFieldUpdateOperationsInput | $Enums.SpaAvailabilityExceptionType
    startTime?: NullableStringFieldUpdateOperationsInput | string | null
    endTime?: NullableStringFieldUpdateOperationsInput | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SpaStaffAvailabilityExceptionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    staffId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumSpaAvailabilityExceptionTypeFieldUpdateOperationsInput | $Enums.SpaAvailabilityExceptionType
    startTime?: NullableStringFieldUpdateOperationsInput | string | null
    endTime?: NullableStringFieldUpdateOperationsInput | string | null
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type EnumSpaBookingStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaBookingStatus | EnumSpaBookingStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaBookingStatusFilter<$PrismaModel> | $Enums.SpaBookingStatus
  }

  export type DecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type SpaBookingItemListRelationFilter = {
    every?: SpaBookingItemWhereInput
    some?: SpaBookingItemWhereInput
    none?: SpaBookingItemWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type SpaBookingItemOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SpaBookingStoreIdRequestKeyCompoundUniqueInput = {
    storeId: string
    requestKey: string
  }

  export type SpaBookingIdStoreIdCompoundUniqueInput = {
    id: string
    storeId: string
  }

  export type SpaBookingCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    customerId?: SortOrder
    serviceStaffId?: SortOrder
    bookingDate?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    serviceNameSnapshot?: SortOrder
    totalPriceSnapshot?: SortOrder
    requestKey?: SortOrder
    notes?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SpaBookingAvgOrderByAggregateInput = {
    totalPriceSnapshot?: SortOrder
  }

  export type SpaBookingMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    customerId?: SortOrder
    serviceStaffId?: SortOrder
    bookingDate?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    serviceNameSnapshot?: SortOrder
    totalPriceSnapshot?: SortOrder
    requestKey?: SortOrder
    notes?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SpaBookingMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    customerId?: SortOrder
    serviceStaffId?: SortOrder
    bookingDate?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    serviceNameSnapshot?: SortOrder
    totalPriceSnapshot?: SortOrder
    requestKey?: SortOrder
    notes?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SpaBookingSumOrderByAggregateInput = {
    totalPriceSnapshot?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type EnumSpaBookingStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaBookingStatus | EnumSpaBookingStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaBookingStatusWithAggregatesFilter<$PrismaModel> | $Enums.SpaBookingStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSpaBookingStatusFilter<$PrismaModel>
    _max?: NestedEnumSpaBookingStatusFilter<$PrismaModel>
  }

  export type DecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type SpaBookingScalarRelationFilter = {
    is?: SpaBookingWhereInput
    isNot?: SpaBookingWhereInput
  }

  export type SpaBookingItemBookingIdSortOrderCompoundUniqueInput = {
    bookingId: string
    sortOrder: number
  }

  export type SpaBookingItemCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    bookingId?: SortOrder
    treatmentId?: SortOrder
    treatmentNameSnapshot?: SortOrder
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaBookingItemAvgOrderByAggregateInput = {
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaBookingItemMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    bookingId?: SortOrder
    treatmentId?: SortOrder
    treatmentNameSnapshot?: SortOrder
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaBookingItemMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    bookingId?: SortOrder
    treatmentId?: SortOrder
    treatmentNameSnapshot?: SortOrder
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaBookingItemSumOrderByAggregateInput = {
    priceSnapshot?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type SpaTreatmentSkillListRelationFilter = {
    every?: SpaTreatmentSkillWhereInput
    some?: SpaTreatmentSkillWhereInput
    none?: SpaTreatmentSkillWhereInput
  }

  export type SpaTreatmentSkillOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SpaTreatmentIdStoreIdCompoundUniqueInput = {
    id: string
    storeId: string
  }

  export type SpaTreatmentStoreIdNameVariantLabelCompoundUniqueInput = {
    storeId: string
    name: string
    variantLabel: string
  }

  export type SpaTreatmentCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    variantLabel?: SortOrder
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    publicVisible?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaTreatmentAvgOrderByAggregateInput = {
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaTreatmentMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    variantLabel?: SortOrder
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    publicVisible?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaTreatmentMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    variantLabel?: SortOrder
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    publicVisible?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaTreatmentSumOrderByAggregateInput = {
    price?: SortOrder
    serviceMinutes?: SortOrder
    bufferMinutes?: SortOrder
    sortOrder?: SortOrder
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type SpaStaffSkillListRelationFilter = {
    every?: SpaStaffSkillWhereInput
    some?: SpaStaffSkillWhereInput
    none?: SpaStaffSkillWhereInput
  }

  export type SpaStaffSkillOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SpaSkillIdStoreIdCompoundUniqueInput = {
    id: string
    storeId: string
  }

  export type SpaSkillStoreIdNameCompoundUniqueInput = {
    storeId: string
    name: string
  }

  export type SpaSkillCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaSkillAvgOrderByAggregateInput = {
    sortOrder?: SortOrder
  }

  export type SpaSkillMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaSkillMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    sortOrder?: SortOrder
  }

  export type SpaSkillSumOrderByAggregateInput = {
    sortOrder?: SortOrder
  }

  export type SpaTreatmentScalarRelationFilter = {
    is?: SpaTreatmentWhereInput
    isNot?: SpaTreatmentWhereInput
  }

  export type SpaSkillScalarRelationFilter = {
    is?: SpaSkillWhereInput
    isNot?: SpaSkillWhereInput
  }

  export type SpaTreatmentSkillTreatmentIdSkillIdCompoundUniqueInput = {
    treatmentId: string
    skillId: string
  }

  export type SpaTreatmentSkillCountOrderByAggregateInput = {
    storeId?: SortOrder
    treatmentId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaTreatmentSkillMaxOrderByAggregateInput = {
    storeId?: SortOrder
    treatmentId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaTreatmentSkillMinOrderByAggregateInput = {
    storeId?: SortOrder
    treatmentId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaStaffSkillStaffIdSkillIdCompoundUniqueInput = {
    staffId: string
    skillId: string
  }

  export type SpaStaffSkillCountOrderByAggregateInput = {
    storeId?: SortOrder
    staffId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaStaffSkillMaxOrderByAggregateInput = {
    storeId?: SortOrder
    staffId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaStaffSkillMinOrderByAggregateInput = {
    storeId?: SortOrder
    staffId?: SortOrder
    skillId?: SortOrder
  }

  export type SpaStaffAvailabilityStoreIdStaffIdDayOfWeekCompoundUniqueInput = {
    storeId: string
    staffId: string
    dayOfWeek: number
  }

  export type SpaStaffAvailabilityCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    dayOfWeek?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    isActive?: SortOrder
  }

  export type SpaStaffAvailabilityAvgOrderByAggregateInput = {
    dayOfWeek?: SortOrder
  }

  export type SpaStaffAvailabilityMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    dayOfWeek?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    isActive?: SortOrder
  }

  export type SpaStaffAvailabilityMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    dayOfWeek?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    isActive?: SortOrder
  }

  export type SpaStaffAvailabilitySumOrderByAggregateInput = {
    dayOfWeek?: SortOrder
  }

  export type EnumSpaAvailabilityExceptionTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaAvailabilityExceptionType | EnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel> | $Enums.SpaAvailabilityExceptionType
  }

  export type SpaStaffAvailabilityExceptionCountOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    date?: SortOrder
    type?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    reason?: SortOrder
  }

  export type SpaStaffAvailabilityExceptionMaxOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    date?: SortOrder
    type?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    reason?: SortOrder
  }

  export type SpaStaffAvailabilityExceptionMinOrderByAggregateInput = {
    id?: SortOrder
    storeId?: SortOrder
    staffId?: SortOrder
    date?: SortOrder
    type?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    reason?: SortOrder
  }

  export type EnumSpaAvailabilityExceptionTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaAvailabilityExceptionType | EnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaAvailabilityExceptionTypeWithAggregatesFilter<$PrismaModel> | $Enums.SpaAvailabilityExceptionType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel>
    _max?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel>
  }

  export type SpaBookingItemCreateNestedManyWithoutBookingInput = {
    create?: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput> | SpaBookingItemCreateWithoutBookingInput[] | SpaBookingItemUncheckedCreateWithoutBookingInput[]
    connectOrCreate?: SpaBookingItemCreateOrConnectWithoutBookingInput | SpaBookingItemCreateOrConnectWithoutBookingInput[]
    createMany?: SpaBookingItemCreateManyBookingInputEnvelope
    connect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
  }

  export type SpaBookingItemUncheckedCreateNestedManyWithoutBookingInput = {
    create?: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput> | SpaBookingItemCreateWithoutBookingInput[] | SpaBookingItemUncheckedCreateWithoutBookingInput[]
    connectOrCreate?: SpaBookingItemCreateOrConnectWithoutBookingInput | SpaBookingItemCreateOrConnectWithoutBookingInput[]
    createMany?: SpaBookingItemCreateManyBookingInputEnvelope
    connect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type EnumSpaBookingStatusFieldUpdateOperationsInput = {
    set?: $Enums.SpaBookingStatus
  }

  export type DecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type SpaBookingItemUpdateManyWithoutBookingNestedInput = {
    create?: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput> | SpaBookingItemCreateWithoutBookingInput[] | SpaBookingItemUncheckedCreateWithoutBookingInput[]
    connectOrCreate?: SpaBookingItemCreateOrConnectWithoutBookingInput | SpaBookingItemCreateOrConnectWithoutBookingInput[]
    upsert?: SpaBookingItemUpsertWithWhereUniqueWithoutBookingInput | SpaBookingItemUpsertWithWhereUniqueWithoutBookingInput[]
    createMany?: SpaBookingItemCreateManyBookingInputEnvelope
    set?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    disconnect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    delete?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    connect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    update?: SpaBookingItemUpdateWithWhereUniqueWithoutBookingInput | SpaBookingItemUpdateWithWhereUniqueWithoutBookingInput[]
    updateMany?: SpaBookingItemUpdateManyWithWhereWithoutBookingInput | SpaBookingItemUpdateManyWithWhereWithoutBookingInput[]
    deleteMany?: SpaBookingItemScalarWhereInput | SpaBookingItemScalarWhereInput[]
  }

  export type SpaBookingItemUncheckedUpdateManyWithoutBookingNestedInput = {
    create?: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput> | SpaBookingItemCreateWithoutBookingInput[] | SpaBookingItemUncheckedCreateWithoutBookingInput[]
    connectOrCreate?: SpaBookingItemCreateOrConnectWithoutBookingInput | SpaBookingItemCreateOrConnectWithoutBookingInput[]
    upsert?: SpaBookingItemUpsertWithWhereUniqueWithoutBookingInput | SpaBookingItemUpsertWithWhereUniqueWithoutBookingInput[]
    createMany?: SpaBookingItemCreateManyBookingInputEnvelope
    set?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    disconnect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    delete?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    connect?: SpaBookingItemWhereUniqueInput | SpaBookingItemWhereUniqueInput[]
    update?: SpaBookingItemUpdateWithWhereUniqueWithoutBookingInput | SpaBookingItemUpdateWithWhereUniqueWithoutBookingInput[]
    updateMany?: SpaBookingItemUpdateManyWithWhereWithoutBookingInput | SpaBookingItemUpdateManyWithWhereWithoutBookingInput[]
    deleteMany?: SpaBookingItemScalarWhereInput | SpaBookingItemScalarWhereInput[]
  }

  export type SpaBookingCreateNestedOneWithoutItemsInput = {
    create?: XOR<SpaBookingCreateWithoutItemsInput, SpaBookingUncheckedCreateWithoutItemsInput>
    connectOrCreate?: SpaBookingCreateOrConnectWithoutItemsInput
    connect?: SpaBookingWhereUniqueInput
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type SpaBookingUpdateOneRequiredWithoutItemsNestedInput = {
    create?: XOR<SpaBookingCreateWithoutItemsInput, SpaBookingUncheckedCreateWithoutItemsInput>
    connectOrCreate?: SpaBookingCreateOrConnectWithoutItemsInput
    upsert?: SpaBookingUpsertWithoutItemsInput
    connect?: SpaBookingWhereUniqueInput
    update?: XOR<XOR<SpaBookingUpdateToOneWithWhereWithoutItemsInput, SpaBookingUpdateWithoutItemsInput>, SpaBookingUncheckedUpdateWithoutItemsInput>
  }

  export type SpaTreatmentSkillCreateNestedManyWithoutTreatmentInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput> | SpaTreatmentSkillCreateWithoutTreatmentInput[] | SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput | SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput[]
    createMany?: SpaTreatmentSkillCreateManyTreatmentInputEnvelope
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
  }

  export type SpaTreatmentSkillUncheckedCreateNestedManyWithoutTreatmentInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput> | SpaTreatmentSkillCreateWithoutTreatmentInput[] | SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput | SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput[]
    createMany?: SpaTreatmentSkillCreateManyTreatmentInputEnvelope
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type SpaTreatmentSkillUpdateManyWithoutTreatmentNestedInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput> | SpaTreatmentSkillCreateWithoutTreatmentInput[] | SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput | SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput[]
    upsert?: SpaTreatmentSkillUpsertWithWhereUniqueWithoutTreatmentInput | SpaTreatmentSkillUpsertWithWhereUniqueWithoutTreatmentInput[]
    createMany?: SpaTreatmentSkillCreateManyTreatmentInputEnvelope
    set?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    disconnect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    delete?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    update?: SpaTreatmentSkillUpdateWithWhereUniqueWithoutTreatmentInput | SpaTreatmentSkillUpdateWithWhereUniqueWithoutTreatmentInput[]
    updateMany?: SpaTreatmentSkillUpdateManyWithWhereWithoutTreatmentInput | SpaTreatmentSkillUpdateManyWithWhereWithoutTreatmentInput[]
    deleteMany?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
  }

  export type SpaTreatmentSkillUncheckedUpdateManyWithoutTreatmentNestedInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput> | SpaTreatmentSkillCreateWithoutTreatmentInput[] | SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput | SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput[]
    upsert?: SpaTreatmentSkillUpsertWithWhereUniqueWithoutTreatmentInput | SpaTreatmentSkillUpsertWithWhereUniqueWithoutTreatmentInput[]
    createMany?: SpaTreatmentSkillCreateManyTreatmentInputEnvelope
    set?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    disconnect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    delete?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    update?: SpaTreatmentSkillUpdateWithWhereUniqueWithoutTreatmentInput | SpaTreatmentSkillUpdateWithWhereUniqueWithoutTreatmentInput[]
    updateMany?: SpaTreatmentSkillUpdateManyWithWhereWithoutTreatmentInput | SpaTreatmentSkillUpdateManyWithWhereWithoutTreatmentInput[]
    deleteMany?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
  }

  export type SpaTreatmentSkillCreateNestedManyWithoutSkillInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput> | SpaTreatmentSkillCreateWithoutSkillInput[] | SpaTreatmentSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutSkillInput | SpaTreatmentSkillCreateOrConnectWithoutSkillInput[]
    createMany?: SpaTreatmentSkillCreateManySkillInputEnvelope
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
  }

  export type SpaStaffSkillCreateNestedManyWithoutSkillInput = {
    create?: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput> | SpaStaffSkillCreateWithoutSkillInput[] | SpaStaffSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaStaffSkillCreateOrConnectWithoutSkillInput | SpaStaffSkillCreateOrConnectWithoutSkillInput[]
    createMany?: SpaStaffSkillCreateManySkillInputEnvelope
    connect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
  }

  export type SpaTreatmentSkillUncheckedCreateNestedManyWithoutSkillInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput> | SpaTreatmentSkillCreateWithoutSkillInput[] | SpaTreatmentSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutSkillInput | SpaTreatmentSkillCreateOrConnectWithoutSkillInput[]
    createMany?: SpaTreatmentSkillCreateManySkillInputEnvelope
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
  }

  export type SpaStaffSkillUncheckedCreateNestedManyWithoutSkillInput = {
    create?: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput> | SpaStaffSkillCreateWithoutSkillInput[] | SpaStaffSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaStaffSkillCreateOrConnectWithoutSkillInput | SpaStaffSkillCreateOrConnectWithoutSkillInput[]
    createMany?: SpaStaffSkillCreateManySkillInputEnvelope
    connect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
  }

  export type SpaTreatmentSkillUpdateManyWithoutSkillNestedInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput> | SpaTreatmentSkillCreateWithoutSkillInput[] | SpaTreatmentSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutSkillInput | SpaTreatmentSkillCreateOrConnectWithoutSkillInput[]
    upsert?: SpaTreatmentSkillUpsertWithWhereUniqueWithoutSkillInput | SpaTreatmentSkillUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: SpaTreatmentSkillCreateManySkillInputEnvelope
    set?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    disconnect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    delete?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    update?: SpaTreatmentSkillUpdateWithWhereUniqueWithoutSkillInput | SpaTreatmentSkillUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: SpaTreatmentSkillUpdateManyWithWhereWithoutSkillInput | SpaTreatmentSkillUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
  }

  export type SpaStaffSkillUpdateManyWithoutSkillNestedInput = {
    create?: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput> | SpaStaffSkillCreateWithoutSkillInput[] | SpaStaffSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaStaffSkillCreateOrConnectWithoutSkillInput | SpaStaffSkillCreateOrConnectWithoutSkillInput[]
    upsert?: SpaStaffSkillUpsertWithWhereUniqueWithoutSkillInput | SpaStaffSkillUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: SpaStaffSkillCreateManySkillInputEnvelope
    set?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    disconnect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    delete?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    connect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    update?: SpaStaffSkillUpdateWithWhereUniqueWithoutSkillInput | SpaStaffSkillUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: SpaStaffSkillUpdateManyWithWhereWithoutSkillInput | SpaStaffSkillUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: SpaStaffSkillScalarWhereInput | SpaStaffSkillScalarWhereInput[]
  }

  export type SpaTreatmentSkillUncheckedUpdateManyWithoutSkillNestedInput = {
    create?: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput> | SpaTreatmentSkillCreateWithoutSkillInput[] | SpaTreatmentSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaTreatmentSkillCreateOrConnectWithoutSkillInput | SpaTreatmentSkillCreateOrConnectWithoutSkillInput[]
    upsert?: SpaTreatmentSkillUpsertWithWhereUniqueWithoutSkillInput | SpaTreatmentSkillUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: SpaTreatmentSkillCreateManySkillInputEnvelope
    set?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    disconnect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    delete?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    connect?: SpaTreatmentSkillWhereUniqueInput | SpaTreatmentSkillWhereUniqueInput[]
    update?: SpaTreatmentSkillUpdateWithWhereUniqueWithoutSkillInput | SpaTreatmentSkillUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: SpaTreatmentSkillUpdateManyWithWhereWithoutSkillInput | SpaTreatmentSkillUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
  }

  export type SpaStaffSkillUncheckedUpdateManyWithoutSkillNestedInput = {
    create?: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput> | SpaStaffSkillCreateWithoutSkillInput[] | SpaStaffSkillUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: SpaStaffSkillCreateOrConnectWithoutSkillInput | SpaStaffSkillCreateOrConnectWithoutSkillInput[]
    upsert?: SpaStaffSkillUpsertWithWhereUniqueWithoutSkillInput | SpaStaffSkillUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: SpaStaffSkillCreateManySkillInputEnvelope
    set?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    disconnect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    delete?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    connect?: SpaStaffSkillWhereUniqueInput | SpaStaffSkillWhereUniqueInput[]
    update?: SpaStaffSkillUpdateWithWhereUniqueWithoutSkillInput | SpaStaffSkillUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: SpaStaffSkillUpdateManyWithWhereWithoutSkillInput | SpaStaffSkillUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: SpaStaffSkillScalarWhereInput | SpaStaffSkillScalarWhereInput[]
  }

  export type SpaTreatmentCreateNestedOneWithoutSkillsInput = {
    create?: XOR<SpaTreatmentCreateWithoutSkillsInput, SpaTreatmentUncheckedCreateWithoutSkillsInput>
    connectOrCreate?: SpaTreatmentCreateOrConnectWithoutSkillsInput
    connect?: SpaTreatmentWhereUniqueInput
  }

  export type SpaSkillCreateNestedOneWithoutTreatmentsInput = {
    create?: XOR<SpaSkillCreateWithoutTreatmentsInput, SpaSkillUncheckedCreateWithoutTreatmentsInput>
    connectOrCreate?: SpaSkillCreateOrConnectWithoutTreatmentsInput
    connect?: SpaSkillWhereUniqueInput
  }

  export type SpaTreatmentUpdateOneRequiredWithoutSkillsNestedInput = {
    create?: XOR<SpaTreatmentCreateWithoutSkillsInput, SpaTreatmentUncheckedCreateWithoutSkillsInput>
    connectOrCreate?: SpaTreatmentCreateOrConnectWithoutSkillsInput
    upsert?: SpaTreatmentUpsertWithoutSkillsInput
    connect?: SpaTreatmentWhereUniqueInput
    update?: XOR<XOR<SpaTreatmentUpdateToOneWithWhereWithoutSkillsInput, SpaTreatmentUpdateWithoutSkillsInput>, SpaTreatmentUncheckedUpdateWithoutSkillsInput>
  }

  export type SpaSkillUpdateOneRequiredWithoutTreatmentsNestedInput = {
    create?: XOR<SpaSkillCreateWithoutTreatmentsInput, SpaSkillUncheckedCreateWithoutTreatmentsInput>
    connectOrCreate?: SpaSkillCreateOrConnectWithoutTreatmentsInput
    upsert?: SpaSkillUpsertWithoutTreatmentsInput
    connect?: SpaSkillWhereUniqueInput
    update?: XOR<XOR<SpaSkillUpdateToOneWithWhereWithoutTreatmentsInput, SpaSkillUpdateWithoutTreatmentsInput>, SpaSkillUncheckedUpdateWithoutTreatmentsInput>
  }

  export type SpaSkillCreateNestedOneWithoutStaffInput = {
    create?: XOR<SpaSkillCreateWithoutStaffInput, SpaSkillUncheckedCreateWithoutStaffInput>
    connectOrCreate?: SpaSkillCreateOrConnectWithoutStaffInput
    connect?: SpaSkillWhereUniqueInput
  }

  export type SpaSkillUpdateOneRequiredWithoutStaffNestedInput = {
    create?: XOR<SpaSkillCreateWithoutStaffInput, SpaSkillUncheckedCreateWithoutStaffInput>
    connectOrCreate?: SpaSkillCreateOrConnectWithoutStaffInput
    upsert?: SpaSkillUpsertWithoutStaffInput
    connect?: SpaSkillWhereUniqueInput
    update?: XOR<XOR<SpaSkillUpdateToOneWithWhereWithoutStaffInput, SpaSkillUpdateWithoutStaffInput>, SpaSkillUncheckedUpdateWithoutStaffInput>
  }

  export type EnumSpaAvailabilityExceptionTypeFieldUpdateOperationsInput = {
    set?: $Enums.SpaAvailabilityExceptionType
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedEnumSpaBookingStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaBookingStatus | EnumSpaBookingStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaBookingStatusFilter<$PrismaModel> | $Enums.SpaBookingStatus
  }

  export type NestedDecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedEnumSpaBookingStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaBookingStatus | EnumSpaBookingStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaBookingStatus[] | ListEnumSpaBookingStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaBookingStatusWithAggregatesFilter<$PrismaModel> | $Enums.SpaBookingStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSpaBookingStatusFilter<$PrismaModel>
    _max?: NestedEnumSpaBookingStatusFilter<$PrismaModel>
  }

  export type NestedDecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaAvailabilityExceptionType | EnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel> | $Enums.SpaAvailabilityExceptionType
  }

  export type NestedEnumSpaAvailabilityExceptionTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SpaAvailabilityExceptionType | EnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SpaAvailabilityExceptionType[] | ListEnumSpaAvailabilityExceptionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSpaAvailabilityExceptionTypeWithAggregatesFilter<$PrismaModel> | $Enums.SpaAvailabilityExceptionType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel>
    _max?: NestedEnumSpaAvailabilityExceptionTypeFilter<$PrismaModel>
  }

  export type SpaBookingItemCreateWithoutBookingInput = {
    id?: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
  }

  export type SpaBookingItemUncheckedCreateWithoutBookingInput = {
    id?: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
  }

  export type SpaBookingItemCreateOrConnectWithoutBookingInput = {
    where: SpaBookingItemWhereUniqueInput
    create: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput>
  }

  export type SpaBookingItemCreateManyBookingInputEnvelope = {
    data: SpaBookingItemCreateManyBookingInput | SpaBookingItemCreateManyBookingInput[]
    skipDuplicates?: boolean
  }

  export type SpaBookingItemUpsertWithWhereUniqueWithoutBookingInput = {
    where: SpaBookingItemWhereUniqueInput
    update: XOR<SpaBookingItemUpdateWithoutBookingInput, SpaBookingItemUncheckedUpdateWithoutBookingInput>
    create: XOR<SpaBookingItemCreateWithoutBookingInput, SpaBookingItemUncheckedCreateWithoutBookingInput>
  }

  export type SpaBookingItemUpdateWithWhereUniqueWithoutBookingInput = {
    where: SpaBookingItemWhereUniqueInput
    data: XOR<SpaBookingItemUpdateWithoutBookingInput, SpaBookingItemUncheckedUpdateWithoutBookingInput>
  }

  export type SpaBookingItemUpdateManyWithWhereWithoutBookingInput = {
    where: SpaBookingItemScalarWhereInput
    data: XOR<SpaBookingItemUpdateManyMutationInput, SpaBookingItemUncheckedUpdateManyWithoutBookingInput>
  }

  export type SpaBookingItemScalarWhereInput = {
    AND?: SpaBookingItemScalarWhereInput | SpaBookingItemScalarWhereInput[]
    OR?: SpaBookingItemScalarWhereInput[]
    NOT?: SpaBookingItemScalarWhereInput | SpaBookingItemScalarWhereInput[]
    id?: StringFilter<"SpaBookingItem"> | string
    storeId?: StringFilter<"SpaBookingItem"> | string
    bookingId?: StringFilter<"SpaBookingItem"> | string
    treatmentId?: StringFilter<"SpaBookingItem"> | string
    treatmentNameSnapshot?: StringFilter<"SpaBookingItem"> | string
    priceSnapshot?: DecimalFilter<"SpaBookingItem"> | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFilter<"SpaBookingItem"> | number
    bufferMinutes?: IntFilter<"SpaBookingItem"> | number
    sortOrder?: IntFilter<"SpaBookingItem"> | number
  }

  export type SpaBookingCreateWithoutItemsInput = {
    id?: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date | string
    startTime: string
    endTime: string
    status?: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal | DecimalJsLike | number | string
    requestKey?: string | null
    notes?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SpaBookingUncheckedCreateWithoutItemsInput = {
    id?: string
    storeId: string
    customerId: string
    serviceStaffId: string
    bookingDate: Date | string
    startTime: string
    endTime: string
    status?: $Enums.SpaBookingStatus
    serviceNameSnapshot: string
    totalPriceSnapshot: Decimal | DecimalJsLike | number | string
    requestKey?: string | null
    notes?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SpaBookingCreateOrConnectWithoutItemsInput = {
    where: SpaBookingWhereUniqueInput
    create: XOR<SpaBookingCreateWithoutItemsInput, SpaBookingUncheckedCreateWithoutItemsInput>
  }

  export type SpaBookingUpsertWithoutItemsInput = {
    update: XOR<SpaBookingUpdateWithoutItemsInput, SpaBookingUncheckedUpdateWithoutItemsInput>
    create: XOR<SpaBookingCreateWithoutItemsInput, SpaBookingUncheckedCreateWithoutItemsInput>
    where?: SpaBookingWhereInput
  }

  export type SpaBookingUpdateToOneWithWhereWithoutItemsInput = {
    where?: SpaBookingWhereInput
    data: XOR<SpaBookingUpdateWithoutItemsInput, SpaBookingUncheckedUpdateWithoutItemsInput>
  }

  export type SpaBookingUpdateWithoutItemsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SpaBookingUncheckedUpdateWithoutItemsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    customerId?: StringFieldUpdateOperationsInput | string
    serviceStaffId?: StringFieldUpdateOperationsInput | string
    bookingDate?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: StringFieldUpdateOperationsInput | string
    endTime?: StringFieldUpdateOperationsInput | string
    status?: EnumSpaBookingStatusFieldUpdateOperationsInput | $Enums.SpaBookingStatus
    serviceNameSnapshot?: StringFieldUpdateOperationsInput | string
    totalPriceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    requestKey?: NullableStringFieldUpdateOperationsInput | string | null
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SpaTreatmentSkillCreateWithoutTreatmentInput = {
    skill: SpaSkillCreateNestedOneWithoutTreatmentsInput
  }

  export type SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput = {
    skillId: string
  }

  export type SpaTreatmentSkillCreateOrConnectWithoutTreatmentInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    create: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput>
  }

  export type SpaTreatmentSkillCreateManyTreatmentInputEnvelope = {
    data: SpaTreatmentSkillCreateManyTreatmentInput | SpaTreatmentSkillCreateManyTreatmentInput[]
    skipDuplicates?: boolean
  }

  export type SpaTreatmentSkillUpsertWithWhereUniqueWithoutTreatmentInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    update: XOR<SpaTreatmentSkillUpdateWithoutTreatmentInput, SpaTreatmentSkillUncheckedUpdateWithoutTreatmentInput>
    create: XOR<SpaTreatmentSkillCreateWithoutTreatmentInput, SpaTreatmentSkillUncheckedCreateWithoutTreatmentInput>
  }

  export type SpaTreatmentSkillUpdateWithWhereUniqueWithoutTreatmentInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    data: XOR<SpaTreatmentSkillUpdateWithoutTreatmentInput, SpaTreatmentSkillUncheckedUpdateWithoutTreatmentInput>
  }

  export type SpaTreatmentSkillUpdateManyWithWhereWithoutTreatmentInput = {
    where: SpaTreatmentSkillScalarWhereInput
    data: XOR<SpaTreatmentSkillUpdateManyMutationInput, SpaTreatmentSkillUncheckedUpdateManyWithoutTreatmentInput>
  }

  export type SpaTreatmentSkillScalarWhereInput = {
    AND?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
    OR?: SpaTreatmentSkillScalarWhereInput[]
    NOT?: SpaTreatmentSkillScalarWhereInput | SpaTreatmentSkillScalarWhereInput[]
    storeId?: StringFilter<"SpaTreatmentSkill"> | string
    treatmentId?: StringFilter<"SpaTreatmentSkill"> | string
    skillId?: StringFilter<"SpaTreatmentSkill"> | string
  }

  export type SpaTreatmentSkillCreateWithoutSkillInput = {
    treatment: SpaTreatmentCreateNestedOneWithoutSkillsInput
  }

  export type SpaTreatmentSkillUncheckedCreateWithoutSkillInput = {
    treatmentId: string
  }

  export type SpaTreatmentSkillCreateOrConnectWithoutSkillInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    create: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput>
  }

  export type SpaTreatmentSkillCreateManySkillInputEnvelope = {
    data: SpaTreatmentSkillCreateManySkillInput | SpaTreatmentSkillCreateManySkillInput[]
    skipDuplicates?: boolean
  }

  export type SpaStaffSkillCreateWithoutSkillInput = {
    staffId: string
  }

  export type SpaStaffSkillUncheckedCreateWithoutSkillInput = {
    staffId: string
  }

  export type SpaStaffSkillCreateOrConnectWithoutSkillInput = {
    where: SpaStaffSkillWhereUniqueInput
    create: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput>
  }

  export type SpaStaffSkillCreateManySkillInputEnvelope = {
    data: SpaStaffSkillCreateManySkillInput | SpaStaffSkillCreateManySkillInput[]
    skipDuplicates?: boolean
  }

  export type SpaTreatmentSkillUpsertWithWhereUniqueWithoutSkillInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    update: XOR<SpaTreatmentSkillUpdateWithoutSkillInput, SpaTreatmentSkillUncheckedUpdateWithoutSkillInput>
    create: XOR<SpaTreatmentSkillCreateWithoutSkillInput, SpaTreatmentSkillUncheckedCreateWithoutSkillInput>
  }

  export type SpaTreatmentSkillUpdateWithWhereUniqueWithoutSkillInput = {
    where: SpaTreatmentSkillWhereUniqueInput
    data: XOR<SpaTreatmentSkillUpdateWithoutSkillInput, SpaTreatmentSkillUncheckedUpdateWithoutSkillInput>
  }

  export type SpaTreatmentSkillUpdateManyWithWhereWithoutSkillInput = {
    where: SpaTreatmentSkillScalarWhereInput
    data: XOR<SpaTreatmentSkillUpdateManyMutationInput, SpaTreatmentSkillUncheckedUpdateManyWithoutSkillInput>
  }

  export type SpaStaffSkillUpsertWithWhereUniqueWithoutSkillInput = {
    where: SpaStaffSkillWhereUniqueInput
    update: XOR<SpaStaffSkillUpdateWithoutSkillInput, SpaStaffSkillUncheckedUpdateWithoutSkillInput>
    create: XOR<SpaStaffSkillCreateWithoutSkillInput, SpaStaffSkillUncheckedCreateWithoutSkillInput>
  }

  export type SpaStaffSkillUpdateWithWhereUniqueWithoutSkillInput = {
    where: SpaStaffSkillWhereUniqueInput
    data: XOR<SpaStaffSkillUpdateWithoutSkillInput, SpaStaffSkillUncheckedUpdateWithoutSkillInput>
  }

  export type SpaStaffSkillUpdateManyWithWhereWithoutSkillInput = {
    where: SpaStaffSkillScalarWhereInput
    data: XOR<SpaStaffSkillUpdateManyMutationInput, SpaStaffSkillUncheckedUpdateManyWithoutSkillInput>
  }

  export type SpaStaffSkillScalarWhereInput = {
    AND?: SpaStaffSkillScalarWhereInput | SpaStaffSkillScalarWhereInput[]
    OR?: SpaStaffSkillScalarWhereInput[]
    NOT?: SpaStaffSkillScalarWhereInput | SpaStaffSkillScalarWhereInput[]
    storeId?: StringFilter<"SpaStaffSkill"> | string
    staffId?: StringFilter<"SpaStaffSkill"> | string
    skillId?: StringFilter<"SpaStaffSkill"> | string
  }

  export type SpaTreatmentCreateWithoutSkillsInput = {
    id?: string
    storeId: string
    name: string
    variantLabel?: string | null
    price: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: number
  }

  export type SpaTreatmentUncheckedCreateWithoutSkillsInput = {
    id?: string
    storeId: string
    name: string
    variantLabel?: string | null
    price: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    publicVisible?: boolean
    isActive?: boolean
    sortOrder?: number
  }

  export type SpaTreatmentCreateOrConnectWithoutSkillsInput = {
    where: SpaTreatmentWhereUniqueInput
    create: XOR<SpaTreatmentCreateWithoutSkillsInput, SpaTreatmentUncheckedCreateWithoutSkillsInput>
  }

  export type SpaSkillCreateWithoutTreatmentsInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    staff?: SpaStaffSkillCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillUncheckedCreateWithoutTreatmentsInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    staff?: SpaStaffSkillUncheckedCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillCreateOrConnectWithoutTreatmentsInput = {
    where: SpaSkillWhereUniqueInput
    create: XOR<SpaSkillCreateWithoutTreatmentsInput, SpaSkillUncheckedCreateWithoutTreatmentsInput>
  }

  export type SpaTreatmentUpsertWithoutSkillsInput = {
    update: XOR<SpaTreatmentUpdateWithoutSkillsInput, SpaTreatmentUncheckedUpdateWithoutSkillsInput>
    create: XOR<SpaTreatmentCreateWithoutSkillsInput, SpaTreatmentUncheckedCreateWithoutSkillsInput>
    where?: SpaTreatmentWhereInput
  }

  export type SpaTreatmentUpdateToOneWithWhereWithoutSkillsInput = {
    where?: SpaTreatmentWhereInput
    data: XOR<SpaTreatmentUpdateWithoutSkillsInput, SpaTreatmentUncheckedUpdateWithoutSkillsInput>
  }

  export type SpaTreatmentUpdateWithoutSkillsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaTreatmentUncheckedUpdateWithoutSkillsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    variantLabel?: NullableStringFieldUpdateOperationsInput | string | null
    price?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    publicVisible?: BoolFieldUpdateOperationsInput | boolean
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaSkillUpsertWithoutTreatmentsInput = {
    update: XOR<SpaSkillUpdateWithoutTreatmentsInput, SpaSkillUncheckedUpdateWithoutTreatmentsInput>
    create: XOR<SpaSkillCreateWithoutTreatmentsInput, SpaSkillUncheckedCreateWithoutTreatmentsInput>
    where?: SpaSkillWhereInput
  }

  export type SpaSkillUpdateToOneWithWhereWithoutTreatmentsInput = {
    where?: SpaSkillWhereInput
    data: XOR<SpaSkillUpdateWithoutTreatmentsInput, SpaSkillUncheckedUpdateWithoutTreatmentsInput>
  }

  export type SpaSkillUpdateWithoutTreatmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    staff?: SpaStaffSkillUpdateManyWithoutSkillNestedInput
  }

  export type SpaSkillUncheckedUpdateWithoutTreatmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    staff?: SpaStaffSkillUncheckedUpdateManyWithoutSkillNestedInput
  }

  export type SpaSkillCreateWithoutStaffInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    treatments?: SpaTreatmentSkillCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillUncheckedCreateWithoutStaffInput = {
    id?: string
    storeId: string
    name: string
    isActive?: boolean
    sortOrder?: number
    treatments?: SpaTreatmentSkillUncheckedCreateNestedManyWithoutSkillInput
  }

  export type SpaSkillCreateOrConnectWithoutStaffInput = {
    where: SpaSkillWhereUniqueInput
    create: XOR<SpaSkillCreateWithoutStaffInput, SpaSkillUncheckedCreateWithoutStaffInput>
  }

  export type SpaSkillUpsertWithoutStaffInput = {
    update: XOR<SpaSkillUpdateWithoutStaffInput, SpaSkillUncheckedUpdateWithoutStaffInput>
    create: XOR<SpaSkillCreateWithoutStaffInput, SpaSkillUncheckedCreateWithoutStaffInput>
    where?: SpaSkillWhereInput
  }

  export type SpaSkillUpdateToOneWithWhereWithoutStaffInput = {
    where?: SpaSkillWhereInput
    data: XOR<SpaSkillUpdateWithoutStaffInput, SpaSkillUncheckedUpdateWithoutStaffInput>
  }

  export type SpaSkillUpdateWithoutStaffInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    treatments?: SpaTreatmentSkillUpdateManyWithoutSkillNestedInput
  }

  export type SpaSkillUncheckedUpdateWithoutStaffInput = {
    id?: StringFieldUpdateOperationsInput | string
    storeId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    sortOrder?: IntFieldUpdateOperationsInput | number
    treatments?: SpaTreatmentSkillUncheckedUpdateManyWithoutSkillNestedInput
  }

  export type SpaBookingItemCreateManyBookingInput = {
    id?: string
    treatmentId: string
    treatmentNameSnapshot: string
    priceSnapshot: Decimal | DecimalJsLike | number | string
    serviceMinutes: number
    bufferMinutes?: number
    sortOrder?: number
  }

  export type SpaBookingItemUpdateWithoutBookingInput = {
    id?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaBookingItemUncheckedUpdateWithoutBookingInput = {
    id?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaBookingItemUncheckedUpdateManyWithoutBookingInput = {
    id?: StringFieldUpdateOperationsInput | string
    treatmentId?: StringFieldUpdateOperationsInput | string
    treatmentNameSnapshot?: StringFieldUpdateOperationsInput | string
    priceSnapshot?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    serviceMinutes?: IntFieldUpdateOperationsInput | number
    bufferMinutes?: IntFieldUpdateOperationsInput | number
    sortOrder?: IntFieldUpdateOperationsInput | number
  }

  export type SpaTreatmentSkillCreateManyTreatmentInput = {
    skillId: string
  }

  export type SpaTreatmentSkillUpdateWithoutTreatmentInput = {
    skill?: SpaSkillUpdateOneRequiredWithoutTreatmentsNestedInput
  }

  export type SpaTreatmentSkillUncheckedUpdateWithoutTreatmentInput = {
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaTreatmentSkillUncheckedUpdateManyWithoutTreatmentInput = {
    skillId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaTreatmentSkillCreateManySkillInput = {
    treatmentId: string
  }

  export type SpaStaffSkillCreateManySkillInput = {
    staffId: string
  }

  export type SpaTreatmentSkillUpdateWithoutSkillInput = {
    treatment?: SpaTreatmentUpdateOneRequiredWithoutSkillsNestedInput
  }

  export type SpaTreatmentSkillUncheckedUpdateWithoutSkillInput = {
    treatmentId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaTreatmentSkillUncheckedUpdateManyWithoutSkillInput = {
    treatmentId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillUpdateWithoutSkillInput = {
    staffId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillUncheckedUpdateWithoutSkillInput = {
    staffId?: StringFieldUpdateOperationsInput | string
  }

  export type SpaStaffSkillUncheckedUpdateManyWithoutSkillInput = {
    staffId?: StringFieldUpdateOperationsInput | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}