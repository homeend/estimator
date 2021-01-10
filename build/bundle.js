var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const materialStore = writable([]);

    const add = (name, price) => {
        materialStore.update((items) => {
            const new_item = {
                name, price,
                id: new Date().getTime()
            };
            return [new_item, ...items];
        });
    };
    const edit = (id, name, price) => {
        materialStore.update((items) => {
            const material = items.find(material => material.id === id);
            if(material){
                material.name = name;
                material.price = price;
            }
            return items;
        });
    };

    const remove = (id) => {
        materialStore.update((items) => {
            return items.filter(material => material.id !== id);
        });
    };

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

    var my_store = {
        subscribe: materialStore.subscribe,
        add,
        edit,
        remove
    };

    /* src\Table.svelte generated by Svelte v3.31.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (46:8) {#each materials as material (material.id)}
    function create_each_block(key_1, ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*material*/ ctx[6].name + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*formatter*/ ctx[2].format(/*material*/ ctx[6].price) + "";
    	let t2;
    	let t3;
    	let td2;
    	let i;
    	let mounted;
    	let dispose;

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			i = element("i");
    			attr(i, "class", "far fa-trash-alt");
    			attr(tr, "class", "editable svelte-1wuzk1o");
    			this.first = tr;
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, t2);
    			append(tr, t3);
    			append(tr, td2);
    			append(td2, i);

    			if (!mounted) {
    				dispose = [
    					listen(i, "click", stop_propagation(function () {
    						if (is_function(/*removeMaterial*/ ctx[4](/*material*/ ctx[6].id))) /*removeMaterial*/ ctx[4](/*material*/ ctx[6].id).apply(this, arguments);
    					})),
    					listen(tr, "click", function () {
    						if (is_function(/*editMaterial*/ ctx[3](/*material*/ ctx[6].id, /*material*/ ctx[6].name, /*material*/ ctx[6].price))) /*editMaterial*/ ctx[3](/*material*/ ctx[6].id, /*material*/ ctx[6].name, /*material*/ ctx[6].price).apply(this, arguments);
    					})
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*materials*/ 1 && t0_value !== (t0_value = /*material*/ ctx[6].name + "")) set_data(t0, t0_value);
    			if (dirty & /*materials*/ 1 && t2_value !== (t2_value = /*formatter*/ ctx[2].format(/*material*/ ctx[6].price) + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (53:8) {#if materials.length>0}
    function create_if_block(ctx) {
    	let tr;
    	let td0;
    	let t1;
    	let td1;
    	let t2_value = /*formatter*/ ctx[2].format(/*cost*/ ctx[1]) + "";
    	let t2;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			td0.textContent = "Total cost:";
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			attr(td1, "rowspan", "2");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*cost*/ 2 && t2_value !== (t2_value = /*formatter*/ ctx[2].format(/*cost*/ ctx[1]) + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let table;
    	let thead;
    	let t4;
    	let tbody;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t5;
    	let each_value = /*materials*/ ctx[0];
    	const get_key = ctx => /*material*/ ctx[6].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let if_block = /*materials*/ ctx[0].length > 0 && create_if_block(ctx);

    	return {
    		c() {
    			table = element("table");
    			thead = element("thead");

    			thead.innerHTML = `<tr><th>Material</th> 
            <th>Price</th> 
            <th></th></tr>`;

    			t4 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t5 = space();
    			if (if_block) if_block.c();
    			attr(table, "class", "primary svelte-1wuzk1o");
    		},
    		m(target, anchor) {
    			insert(target, table, anchor);
    			append(table, thead);
    			append(table, t4);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			append(tbody, t5);
    			if (if_block) if_block.m(tbody, null);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*editMaterial, materials, removeMaterial, formatter*/ 29) {
    				each_value = /*materials*/ ctx[0];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, tbody, destroy_block, create_each_block, t5, get_each_context);
    			}

    			if (/*materials*/ ctx[0].length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(tbody, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(table);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let materials = [];
    	let cost = 0;

    	my_store.subscribe(items => {
    		$$invalidate(0, materials = items);
    		$$invalidate(1, cost = items.map(e => e.price).reduce((prev, next) => prev + next, 0));
    	});

    	const formatter = new Intl.NumberFormat("pl-pl", { style: "currency", currency: "PLN" });
    	const dispatch = createEventDispatcher();

    	function editMaterial(id, name, price) {
    		// console.log(id, name, price);
    		dispatch("edit", { id, name, price });
    	}

    	function removeMaterial(id) {
    		my_store.remove(id);
    	}

    	return [materials, cost, formatter, editMaterial, removeMaterial];
    }

    class Table extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    /* src\Form.svelte generated by Svelte v3.31.2 */

    function create_if_block$1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Cancel";
    			attr(button, "class", "float-right svelte-15smpqf");
    			attr(button, "type", "button");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*cancel*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let form;
    	let fieldset;
    	let label0;
    	let t1;
    	let input0;
    	let t2;
    	let label1;
    	let t4;
    	let input1;
    	let t5;
    	let button;
    	let t6_value = (/*add_mode*/ ctx[2] ? "Add" : "Edit") + "";
    	let t6;
    	let button_disabled_value;
    	let t7;
    	let mounted;
    	let dispose;
    	let if_block = !/*add_mode*/ ctx[2] && create_if_block$1(ctx);

    	return {
    		c() {
    			form = element("form");
    			fieldset = element("fieldset");
    			label0 = element("label");
    			label0.textContent = "Material";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			label1 = element("label");
    			label1.textContent = "Price";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			button = element("button");
    			t6 = text(t6_value);
    			t7 = space();
    			if (if_block) if_block.c();
    			attr(label0, "for", "NameField");
    			attr(input0, "type", "text");
    			attr(input0, "placeholder", "Wood, Glue, Etc");
    			attr(input0, "id", "NameField");
    			attr(label1, "for", "PriceField");
    			attr(input1, "type", "number");
    			attr(input1, "min", "0");
    			attr(input1, "step", "any");
    			attr(input1, "placeholder", "Price");
    			attr(input1, "id", "PriceField");
    			attr(button, "class", "float-right svelte-15smpqf");
    			button.disabled = button_disabled_value = !/*can_submit*/ ctx[3];
    			attr(button, "type", "submit");
    		},
    		m(target, anchor) {
    			insert(target, form, anchor);
    			append(form, fieldset);
    			append(fieldset, label0);
    			append(fieldset, t1);
    			append(fieldset, input0);
    			set_input_value(input0, /*name*/ ctx[0]);
    			append(fieldset, t2);
    			append(fieldset, label1);
    			append(fieldset, t4);
    			append(fieldset, input1);
    			set_input_value(input1, /*price*/ ctx[1]);
    			append(form, t5);
    			append(form, button);
    			append(button, t6);
    			append(form, t7);
    			if (if_block) if_block.m(form, null);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[7]),
    					listen(input1, "input", /*input1_input_handler*/ ctx[8]),
    					listen(form, "submit", prevent_default(/*submit_form*/ ctx[4]))
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*name*/ 1 && input0.value !== /*name*/ ctx[0]) {
    				set_input_value(input0, /*name*/ ctx[0]);
    			}

    			if (dirty & /*price*/ 2 && to_number(input1.value) !== /*price*/ ctx[1]) {
    				set_input_value(input1, /*price*/ ctx[1]);
    			}

    			if (dirty & /*add_mode*/ 4 && t6_value !== (t6_value = (/*add_mode*/ ctx[2] ? "Add" : "Edit") + "")) set_data(t6, t6_value);

    			if (dirty & /*can_submit*/ 8 && button_disabled_value !== (button_disabled_value = !/*can_submit*/ ctx[3])) {
    				button.disabled = button_disabled_value;
    			}

    			if (!/*add_mode*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(form, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(form);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let add_mode;
    	let can_submit;
    	let { id } = $$props;
    	let { name = "" } = $$props;
    	let { price } = $$props;

    	function submit_form() {
    		if (!can_submit) {
    			return;
    		}

    		if (add_mode) {
    			my_store.add(name, price);
    		} else {
    			my_store.edit(id, name, price);
    		}

    		$$invalidate(1, price = "");
    		$$invalidate(0, name = "");
    		$$invalidate(6, id = undefined);
    	}

    	function cancel() {
    		$$invalidate(1, price = "");
    		$$invalidate(0, name = "");
    		$$invalidate(6, id = undefined);
    	}

    	function input0_input_handler() {
    		name = this.value;
    		$$invalidate(0, name);
    	}

    	function input1_input_handler() {
    		price = to_number(this.value);
    		$$invalidate(1, price);
    	}

    	$$self.$$set = $$props => {
    		if ("id" in $$props) $$invalidate(6, id = $$props.id);
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("price" in $$props) $$invalidate(1, price = $$props.price);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*id*/ 64) {
    			 $$invalidate(2, add_mode = id === undefined);
    		}

    		if ($$self.$$.dirty & /*name, price*/ 3) {
    			 $$invalidate(3, can_submit = name !== undefined && name !== null && name.length > 0 && price !== undefined && price !== null && price >= 0);
    		}
    	};

    	return [
    		name,
    		price,
    		add_mode,
    		can_submit,
    		submit_form,
    		cancel,
    		id,
    		input0_input_handler,
    		input1_input_handler
    	];
    }

    class Form extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { id: 6, name: 0, price: 1 });
    	}
    }

    /* src\App.svelte generated by Svelte v3.31.2 */

    function create_fragment$2(ctx) {
    	let main;
    	let h1;
    	let t1;
    	let form;
    	let updating_price;
    	let updating_id;
    	let updating_name;
    	let t2;
    	let table;
    	let current;

    	function form_price_binding(value) {
    		/*form_price_binding*/ ctx[4].call(null, value);
    	}

    	function form_id_binding(value) {
    		/*form_id_binding*/ ctx[5].call(null, value);
    	}

    	function form_name_binding(value) {
    		/*form_name_binding*/ ctx[6].call(null, value);
    	}

    	let form_props = {};

    	if (/*price*/ ctx[2] !== void 0) {
    		form_props.price = /*price*/ ctx[2];
    	}

    	if (/*id*/ ctx[0] !== void 0) {
    		form_props.id = /*id*/ ctx[0];
    	}

    	if (/*name*/ ctx[1] !== void 0) {
    		form_props.name = /*name*/ ctx[1];
    	}

    	form = new Form({ props: form_props });
    	binding_callbacks.push(() => bind(form, "price", form_price_binding));
    	binding_callbacks.push(() => bind(form, "id", form_id_binding));
    	binding_callbacks.push(() => bind(form, "name", form_name_binding));
    	table = new Table({});
    	table.$on("edit", /*passEditData*/ ctx[3]);

    	return {
    		c() {
    			main = element("main");
    			h1 = element("h1");
    			h1.textContent = "Estimator";
    			t1 = space();
    			create_component(form.$$.fragment);
    			t2 = space();
    			create_component(table.$$.fragment);
    			attr(main, "class", "svelte-1kldptc");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, h1);
    			append(main, t1);
    			mount_component(form, main, null);
    			append(main, t2);
    			mount_component(table, main, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const form_changes = {};

    			if (!updating_price && dirty & /*price*/ 4) {
    				updating_price = true;
    				form_changes.price = /*price*/ ctx[2];
    				add_flush_callback(() => updating_price = false);
    			}

    			if (!updating_id && dirty & /*id*/ 1) {
    				updating_id = true;
    				form_changes.id = /*id*/ ctx[0];
    				add_flush_callback(() => updating_id = false);
    			}

    			if (!updating_name && dirty & /*name*/ 2) {
    				updating_name = true;
    				form_changes.name = /*name*/ ctx[1];
    				add_flush_callback(() => updating_name = false);
    			}

    			form.$set(form_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(form.$$.fragment, local);
    			transition_in(table.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(form.$$.fragment, local);
    			transition_out(table.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(form);
    			destroy_component(table);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let id;
    	let name = "";
    	let price;

    	function passEditData(evt) {
    		$$invalidate(0, { id, name, price } = evt.detail, id, $$invalidate(1, name), $$invalidate(2, price));
    	}

    	function form_price_binding(value) {
    		price = value;
    		$$invalidate(2, price);
    	}

    	function form_id_binding(value) {
    		id = value;
    		$$invalidate(0, id);
    	}

    	function form_name_binding(value) {
    		name = value;
    		$$invalidate(1, name);
    	}

    	return [
    		id,
    		name,
    		price,
    		passEditData,
    		form_price_binding,
    		form_id_binding,
    		form_name_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map