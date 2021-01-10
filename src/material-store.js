import { createEventDispatcher } from 'svelte';
import {writable} from 'svelte/store';

const materialStore = writable([]);

const add = (name, price) => {
    materialStore.update((items) => {
        const new_item = {
            name, price,
            id: new Date().getTime()
        }
        return [new_item, ...items];
    });
}

const LOCAL_STORE_KEY = 'estimator-local-store';

if(localStorage.getItem(LOCAL_STORE_KEY)){
    const data = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY));
    materialStore.set(data);
}

materialStore.subscribe((items) => {
    console.log(items);
    const jsonData = JSON.stringify(items);
    localStorage.setItem(LOCAL_STORE_KEY, jsonData);
});

export default {
    subscribe: materialStore.subscribe,
    add,
}