import DBConnection from "./db/DBConnection.js";
import DBManager from "./db/DBManager.js";
import beanFactory, {BeanFactory} from "./BeanFactory.js";
import CommonService from "./CommonService.js";
import CommonDAO from "./CommonDAO.js";
import CommonRepository from "./CommonRepository.js";
import StringUtils from "./StringUtils.js";
import BitsBoolean from "./BitsBoolean.js";
import OptimisticLockException from "./db/OptimisticLockException.js";
import SearchCriteria from "./db/SearchCriteria.js";
import CommonSearchCriteria from "./db/CommonSearchCriteria.js";
import {FieldType} from "./db/Field.js";
import TransactionManager from "./TransactionManager.js";
import {Transaction, Propagation} from "./db/Transaction.js";
import {getLogger, sqlContext, SQL_PARAMS_ENV} from "./Logger.js";
import Beans from "./Beans.js";

import type DBFactory from "./db/DBFactory.js";
import type BaseDAO from "./biz/BaseDAO.js";
import type BaseCRUDDAO from "./biz/BaseCRUDDAO.js";
import type PaginationList from "./db/PaginationList.js";
import type Field from "./db/Field.js";
import type BatchRecord from "./biz/BatchRecord.js";
import type {BatchRecords} from "./biz/BatchRecord.js";
import type {QuickSearchResult} from "./CommonDAO.js";
import type {PostConstructionFun, UpdateResult, InsertResult} from "./db/DBConnection.js";
import type {Logger} from "./Logger.js";

/** 运行时值（类、枚举、函数、单例）。 */
export {
    DBManager, DBConnection,
    BeanFactory, beanFactory, Beans,
    CommonService, CommonDAO, CommonRepository,
    StringUtils, BitsBoolean,
    OptimisticLockException,
    SearchCriteria, CommonSearchCriteria,
    FieldType,
    TransactionManager, Transaction, Propagation,
    getLogger, sqlContext, SQL_PARAMS_ENV
};

/**
 * 纯类型导出。接口与类型别名必须走 `export type`，否则在 isolatedModules 或仅转译的
 * 工具链（esbuild、swc、ts-jest）下，消费方会因为找不到对应的运行时值而报错。
 */
export type {
    DBFactory,
    BaseDAO, BaseCRUDDAO,
    PaginationList,
    Field,
    BatchRecord, BatchRecords,
    QuickSearchResult,
    PostConstructionFun, UpdateResult, InsertResult,
    Logger
};
