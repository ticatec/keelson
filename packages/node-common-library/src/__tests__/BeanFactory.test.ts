import { BeanFactory } from '../BeanFactory.js';

describe('BeanFactory', () => {
    let factory: BeanFactory;

    beforeEach(() => {
        factory = new BeanFactory();
    });

    test('should lazily instantiate registered bean on first property access', () => {
        let constructedCount = 0;

        class ServiceA {
            constructor() {
                constructedCount++;
            }
            getValue() {
                return 'A_VALUE';
            }
        }

        factory.register('ServiceA', ServiceA);
        const proxyA = factory.createBean<ServiceA>('ServiceA')!;

        expect(proxyA).toBeDefined();
        expect(constructedCount).toBe(0); // Not constructed yet

        expect(proxyA.getValue()).toBe('A_VALUE'); // Constructed on access
        expect(constructedCount).toBe(1);

        expect(proxyA.getValue()).toBe('A_VALUE'); // Reuse cached instance
        expect(constructedCount).toBe(1);
    });

    test('should detect circular dependency during construction', () => {
        class BeanA {
            constructor() {
                factory.createBean<BeanB>('BeanB')!.sayHello();
            }
            sayHello() { return 'hello'; }
        }

        class BeanB {
            constructor() {
                factory.createBean<BeanA>('BeanA')!.sayHello();
            }
            sayHello() { return 'hello'; }
        }

        factory.register('BeanA', BeanA);
        factory.register('BeanB', BeanB);

        const proxyA = factory.createBean<BeanA>('BeanA')!;
        expect(() => {
            proxyA.sayHello();
        }).toThrow(/Circular dependency detected/);
    });

    test('should return undefined if bean is not registered', () => {
        const proxy = factory.createBean('NonExistent');
        expect(proxy).toBeUndefined();
    });
});
