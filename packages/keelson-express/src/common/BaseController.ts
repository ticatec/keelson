import Controller from "./Controller.js";

/**
 * Abstract base controller class providing common functionality for all controllers
 * @template T The service type this controller depends on
 */
export default abstract class BaseController<T> extends Controller {
    /** The service instance this controller uses */
    protected readonly service: T;

    /**
     * Constructor for base controller
     * @param service The service instance to inject
     * @protected
     */
    protected constructor(service: T) {
        super();
        this.service = service;
    }
}