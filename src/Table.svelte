<script>
    import my_store from './material-store.js';
    import {createEventDispatcher} from 'svelte';

    let materials = [];
    let cost = 0;

    my_store.subscribe(items => {
        materials = items;
        cost = items.map(e => e.price).reduce((prev, next) => prev + next, 0);
    });

    const formatter = new Intl.NumberFormat('pl-pl', {style: "currency", currency: "PLN"});

    const dispatch = createEventDispatcher();

    function editMaterial(id, name, price){
        console.log(id, name, price);
        dispatch('edit', {id, name, price});
    }

</script>

<style>
    table {
        width: 100%;
    }
    tr.editable {
        cursor: pointer;
    }
</style>

<table class="primary">
    <thead>
        <tr>
            <th>Material</th>
            <th>Price</th>
            <th/>
        </tr>
    </thead>
    <tbody>
        {#each materials as material (material.id)}
        <tr class="editable" on:click={editMaterial(material.id, material.name, material.price)}>
            <td>{material.name}</td>
            <td>{formatter.format(material.price)}</td>
            <td><i class="far fa-trash-alt" /></td>
        </tr>
        {/each}
        {#if materials.length>0}
        <tr>
            <td>Total cost:</td>
            <td rowspan="2">{formatter.format(cost)}</td>
        </tr>
        {/if}
    </tbody>
</table>
