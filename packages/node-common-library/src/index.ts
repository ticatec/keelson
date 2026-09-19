import DBFactory from "./db/DBFactory.js";
import DBConnection from "./db/DBConnection.js";
import DBManager from "./db/DBManager.js";
import beanFactory, {BeanFactory} from "./BeanFactory.js";
import CommonService from "./CommonService.js";
import CommonDAO, {QuickSearchResult} from "./CommonDAO.js";
import CommonRepository from "./CommonRepository.js";
import StringUtils from "./StringUtils.js";
import BitsBoolean from "./BitsBoolean.js";
import OptimisticLockException from "./db/OptimisticLockException.js";
import PaginationList from "./db/PaginationList.js";
import SearchCriteria from "./db/SearchCriteria.js";
import CommonSearchCriteria from "./db/CommonSearchCriteria.js";
import Field, {FieldType} from "./db/Field.js";
import TransactionManager from "./TransactionManager.js";
import {Transaction, Propagation} from "./db/Transaction.js";
import BaseDAO from "./biz/BaseDAO.js";
import BaseCRUDDAO from "./biz/BaseCRUDDAO.js";
import BatchRecord, {BatchRecords} from "./biz/BatchRecord.js";
import {PostConstructionFun, UpdateResult, InsertResult} from "./db/DBConnection.js";
import {getLogger, sqlContext, SQL_PARAMS_ENV} from "./Logger.js";
import type {Logger} from "./Logger.js";
import Beans from "./Beans.js";


export {
    DBManager, DBConnection, DBFactory,
    BeanFactory, beanFactory, Beans,
    CommonService, CommonDAO, CommonRepository,
    StringUtils, BitsBoolean,
    OptimisticLockException,
    PaginationList, SearchCriteria, CommonSearchCriteria,
    Field, FieldType,
    TransactionManager, Transaction, Propagation,
    BaseDAO, BaseCRUDDAO, BatchRecord, BatchRecords,
    PostConstructionFun, UpdateResult, InsertResult, QuickSearchResult,
    getLogger, sqlContext, SQL_PARAMS_ENV
};

/** 类型以 export type 导出，兼容 isolatedModules / 仅转译的工具链。 */
export type { Logger };