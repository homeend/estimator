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

materialStore.subscribe((items) => {
    console.log(items);
});

export default {
    subscribe: materialStore.subscribe,
    add,
}