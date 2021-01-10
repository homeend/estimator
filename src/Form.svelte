<script>
    export let id;
    export let name = "";
    export let price;
    $: add_mode = id === undefined;
    $: can_submit = name!==undefined && name!==null && name.length>0 
        && price!==undefined && price!==null && price>=0;

    function submit_form(){
        if(!can_submit){
            return;
        }
        price = '';
        name = '';
        id = undefined;
    }

    function cancel(){
        price = '';
        name = '';
        id = undefined;
    }
</script>

<style>
    button {
        margin-left: 20px;
    }
    button:disabled {
        cursor: not-allowed;
    }    
</style>
<form on:submit|preventDefault={submit_form}>
    <fieldset>
        <label for="NameField">Material</label>
        <input type="text" bind:value={name} placeholder="Wood, Glue, Etc" id="NameField" />
        <label for="PriceField">Price</label>
        <input type="number" bind:value={price} min="0" step="any" placeholder="Price" id="PriceField" />
    </fieldset>
    <button class="float-right" disabled="{!can_submit}" type="submit">{add_mode ? "Add" : "Edit"}</button>
    {#if !add_mode}
    <button class="float-right" on:click={cancel} type="button">Cancel</button>
    {/if}
</form>