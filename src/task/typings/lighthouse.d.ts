declare module 'lighthouse' {
    import {IPromise} from "q";

    const lighthouse: {
        (url: string,
         flags: object,
         perfConfig: object): IPromise<object>;
    };

    export = lighthouse;
}