/**
 * Database field data types.
 */
export enum FieldType {
    Text = 'Text',
    Number = 'Number',
    Date = 'Date'
}

/**
 * Database field definition interface.
 */
export default interface Field {
    /**
     * Field name.
     */
    name: string;
    /**
     * Field data type.
     */
    type: FieldType;
    /**
     * Optional maximum field length.
     */
    length?: number;
}