# vscode-code-review Model Usage

- [How To Add A Property](#how-to-add-a-property)
- [How To Delete A Property](#how-to-delete-a-property)

## How To Add A Property

In this sample, we are going to add a new property `state` of type `number`.  
All the steps will be operated in the file `model.ts`.

1. Add the property to the **interface** `CsvEntry`:


    ```diff
    export interface CsvEntry {
        sha: string;
        filename: string;
        url: string;
        lines: string;
        title: string;
        comment: string;
        priority: number;
        category: string;
        additional: string;
        code?: string;
        /** Unique identifier of the entry */
        id: string;
+       /** The new state property */
+       state: number;
    }
    ```

2. Reference the new property as being part of the **CSV header** in the array `CsvStructure.headers`:

    Before:

    ```typescript
    private static readonly headers: string[] = [
        'sha',
        'filename',
        'url',
        'lines',
        'title',
        'comment',
        'priority',
        'category',
        'additional',
        'id'
    ];
    ```

    After:

    ```typescript
    private static readonly headers: string[] = [
        'sha',
        'filename',
        'url',
        'lines',
        'title',
        'comment',
        'priority',
        'category',
        'additional',
        'id',
        'state'
    ];
    ```

    **Attention!** The new property must always be added **at the end** of the array.

3. Declare an **initializer** for the property in the dictionary `CsvStructure.defaults`:

    Before:

    ```typescript
    private static readonly defaults: Map<string, () => any>
        = new Map([
            ['id', () => uuidv4()]
        ]);
    ```

    After:

    ```typescript
    private static readonly defaults: Map<string, () => any>
        = new Map([
            ['id', () => uuidv4()],
            ['state', () => 0]
        ]);
    ```

    *Here, the default value is `0`.*

    This initializer will be used at **migration** time to fill values of the exisiting rows in the CSV file.

4. Update the **instantiation** function `createCommentFromObject()`  
   *This step is optional.*

Before:

```typescript
export function createCommentFromObject(object: any): CsvEntry {
    const comment = JSON.parse(object) as CsvEntry;
    comment.id = CsvStructure.getDefaultValue('id')!;

    return comment;
}
```

After:

```typescript
export function createCommentFromObject(object: any): CsvEntry {
    const comment = JSON.parse(object) as CsvEntry;
    comment.id = CsvStructure.getDefaultValue('id')!;
    comment.state = CsvStructure.getDefaultValue('state')!;

    return comment;
}
```

## How To Delete A Property

This operation is **FORBIDDEN**!

A property can only be deprecated (by not being used anymore in the implementation), but not removed from the storage.

A sample way to deprecate a property is to add a comment above it in the **interface** `CsvEntry`:

```typescript
export interface CsvEntry {
    sha: string;
    filename: string;
    /** Obsolete property */
    url: string;
    lines: string;
    title: string;
    comment: string;
    priority: number;
    category: string;
    additional: string;
    code?: string;
    /** Unique identifier of the entry */
    id: string;
    /** The new state property */
    state: number;
}
```

*Here, we marked the property `url` with an obsolete comment.*
