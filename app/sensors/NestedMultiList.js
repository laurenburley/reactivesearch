/* eslint max-lines: 0 */
import React, { Component } from "react";
import classNames from "classnames";
import {
	InitialLoader,
	TYPES,
	AppbaseChannelManager as manager,
	AppbaseSensorHelper as helper
} from "@appbaseio/reactivemaps";
import StaticSearch from "../addons/StaticSearch";

const _ = require("lodash");

export default class NestedMultiList extends Component {
	constructor(props) {
		super(props);
		this.state = {
			items: [],
			storedItems: [],
			rawData: {
				hits: {
					hits: []
				}
			},
			subItems: [],
			selectedValues: {}
		};
		this.nested = [
			"nestedParentaggs"
		];
		this.sortObj = {
			aggSort: this.props.sortBy
		};
		this.channelId = null;
		this.channelListener = null;
		this.urlParams = helper.URLParams.get(this.props.componentId);
		this.urlParams = this.urlParams ? this.urlParams.split("/") : null;
		this.filterBySearch = this.filterBySearch.bind(this);
		this.onItemClick = this.onItemClick.bind(this);
		this.customQuery = this.customQuery.bind(this);
		this.handleSelect = this.handleSelect.bind(this);
		this.nestedAggQuery = this.nestedAggQuery.bind(this);
		this.type = "term";
	}

	// Get the items from Appbase when component is mounted
	componentWillMount() {
		this.setReact(this.props);
		this.setQueryInfo();
		this.createChannel();
	}

	componentDidMount() {
		setTimeout(this.checkDefault.bind(this, this.props), 100);
		this.listenFilter();
	}

	componentWillReceiveProps(nextProps) {
		if (!_.isEqual(this.props.defaultSelected, nextProps.defaultSelected)) {
			this.changeValue(nextProps.defaultSelected);
		}
		if (!_.isEqual(this.props.react, nextProps.react)) {
			this.setReact(nextProps);
			manager.update(this.channelId, this.react, nextProps.size, 0, false);
		}
	}

	// stop streaming request and remove listener when component will unmount
	componentWillUnmount() {
		if (this.channelId) {
			manager.stopStream(this.channelId);
		}
		if (this.channelListener) {
			this.channelListener.remove();
		}
		if (this.loadListenerParent) {
			this.loadListenerParent.remove();
		}
		if (this.loadListenerChild) {
			this.loadListenerChild.remove();
		}
		if(this.filterListener) {
			this.filterListener.remove();
		}
	}

	listenFilter() {
		this.filterListener = helper.sensorEmitter.addListener("clearFilter", (data) => {
			if(data === this.props.componentId) {
				this.changeValue(null);
			}
		});
	}

	checkDefault(props) {
		this.urlParams = helper.URLParams.get(props.componentId);
		this.urlParams = this.urlParams ? this.urlParams.split("/") : null;
		const defaultValue = this.urlParams !== null ? this.urlParams : props.defaultSelected;
		this.changeValue(defaultValue);
	}

	changeValue(defaultValue) {
		if (!_.isEqual(this.defaultSelected, defaultValue)) {
			this.defaultSelected = defaultValue;
			this.handleSelect(this.defaultSelected);
		}
		if (this.sortBy !== this.props.sortBy) {
			this.sortBy = this.props.sortBy;
			this.handleSortSelect();
		}
	}

	handleSelect(defaultSelected) {
		if (defaultSelected) {
			this.defaultSelected.forEach((value, index) => {
				if (Array.isArray(value)) {
					value.map(item => {
						setTimeout(() => {
							this.onItemClick(item, index);
						}, 500);
					});
				} else {
					setTimeout(() => {
						this.onItemClick(value, index);
					}, 500);
				}
			});
		} else if(this.defaultSelected === null) {
			this.onItemClick(null, 0);
		}
	}

	// build query for this sensor only
	customQuery(record) {
		let query = null;
		function generateTermsQuery(appbaseField) {
			return Object.keys(record).map((key, index) => ({
				terms: {
					[appbaseField[index]]: Array.isArray(record[key]) ? record[key] : [record[key]]
				}
			}));
		}
		if (record && record[0] !== null) {
			query = {
				bool: {
					must: generateTermsQuery(this.props.appbaseField)
				}
			};
		}
		return query;
	}

	// set the query type and input data
	setQueryInfo() {
		const obj = {
			key: this.props.componentId,
			value: {
				queryType: this.type,
				inputData: this.props.appbaseField[0],
				customQuery: this.props.customQuery ? this.props.customQuery : this.customQuery,
				reactiveId: this.context.reactiveId,
				showFilter: this.props.showFilter,
				filterLabel: this.props.filterLabel ? this.props.filterLabel : this.props.componentId,
				component: "NestedMultiList",
				defaultSelected: this.urlParams !== null ? this.urlParams : this.props.defaultSelected
			}
		};
		helper.selectedSensor.setSensorInfo(obj);
		const nestedObj = {
			key: `nestedSelectedValues-${this.props.componentId}`,
			value: {
				queryType: this.type,
				inputData: this.props.appbaseField[0],
				customQuery: () => { }
			}
		};
		helper.selectedSensor.setSensorInfo(nestedObj);
	}

	includeAggQuery() {
		this.nested.forEach((name) => {
			const obj = {
				key: name,
				value: this.sortObj
			};
			helper.selectedSensor.setSortInfo(obj);
		});
	}

	handleSortSelect() {
		this.sortObj = {
			aggSort: this.props.sortBy
		};
		this.nested.forEach((name) => {
			const obj = {
				key: name,
				value: this.sortObj
			};
			helper.selectedSensor.set(obj, true, "sortChange");
		});
	}

	nestedAggQuery() {
		let query = null;
		const level = Object.keys(this.state.selectedValues).length || 0;
		const field = this.props.appbaseField[level];
		const orderType = this.props.sortBy === "count" ? "_count" : "_term";
		const sortBy = this.props.sortBy === "count" ? "desc" : this.props.sortBy;

		const createTermQuery = (index) => {
			const value = this.state.selectedValues[index];
			if (value.length === 1) {
				return {
					term: {
						[this.props.appbaseField[index]]: value[0]
					}
				}
			}
			return null;
		};

		const createFilterQuery = (level) => {
			const filterMust = [];
			if(level > 0) {
				for(let i = 0; i <= level-1; i++) {
					const termQuery = createTermQuery(i);
					if (termQuery) {
						filterMust.push(termQuery);
					}
				}
			}
			if (Array.isArray(filterMust) && filterMust.length) {
				return {
					bool: {
						must: filterMust
					}
				};
			}
			return null;
		};

		const init = (field, level) => ({
			[`${field}-${level}`]: {
				filter: createFilterQuery(level) || {},
				aggs: {
					[field]: {
						terms: {
							field: field,
							size: this.props.size,
							order: {
								[orderType]: sortBy
							}
						}
					}
				}
			}
		});

		if(level >= 0 && level < this.props.appbaseField.length) {
			query = init(field, level);
		}

		return query;
	}

	setReact(props) {
		const react = Object.assign({}, props.react);
		react.aggs = {
			key: props.appbaseField[0],
			sort: props.sortBy,
			size: props.size,
			customQuery: this.nestedAggQuery
		};
		const reactAnd = [this.nested[0], `nestedSelectedValues-${props.componentId}`];
		this.react = helper.setupReact(react, reactAnd);
	}

	// Create a channel which passes the react and receive results whenever react changes
	createChannel() {
		this.includeAggQuery();
		// create a channel and listen the changes
		const channelObj = manager.create(this.context.appbaseRef, this.context.type, this.react, 100, 0, false, this.props.componentId);
		this.channelId = channelObj.channelId;
		this.channelListener = channelObj.emitter.addListener(this.channelId, (res) => {
			if (res.error) {
				this.setState({
					queryStart: false
				});
			}
			if (res.appliedQuery && Object.keys(res.appliedQuery).length) {
				this.queryLevel = this.getQueryLevel(res.appliedQuery);
				this.setState({
					queryStart: false,
					rawData: res.data
				});
				this.setData(res.data, this.queryLevel);
			}
		});
		this.listenLoadingChannel(channelObj, "loadListenerParent");
	}

	getQueryLevel(appliedQuery) {
		let level = 0;
		try {
			const field = Object.keys(appliedQuery.body.aggs)[0];
			if (field) {
				const appliedField = (field.split("-"))[0];
				level = this.props.appbaseField.indexOf(appliedField);
				level = level > -1 ? level : 0;
			}
		} catch(e) {
			console.log(e);
		}
		return level;
	}

	listenLoadingChannel(channelObj, listener) {
		this[listener] = channelObj.emitter.addListener(`${channelObj.channelId}-query`, (res) => {
			if (res.appliedQuery) {
				this.setState({
					queryStart: res.queryState
				});
			}
		});
	}

	setData(data, level) {
		const fieldLevel = `${this.props.appbaseField[level]}-${level}`;
		if (data && data.aggregations && data.aggregations[fieldLevel] && data.aggregations[fieldLevel][this.props.appbaseField[level]] && data.aggregations[fieldLevel][this.props.appbaseField[level]].buckets) {
			this.addItemsToList(data.aggregations[fieldLevel][this.props.appbaseField[level]].buckets, level);
		}
	}

	addItemsToList(newItems, level) {
		newItems = newItems.map((item) => {
			item.key = item.key.toString();
			return item;
		});
		const { items } = this.state;
		if (newItems) {
			items[level] = newItems;
		} else {
			delete items[level];
		}
		this.setState({
			items,
			storedItems: items
		});
	}

	// set value
	setValue(value, isExecuteQuery = false, changeNestedValue=true) {
		value = Object.keys(value).length ? value : null;
		const obj = {
			key: this.props.componentId,
			value
		};
		const nestedObj = {
			key: `nestedSelectedValues-${this.props.componentId}`,
			value
		};
		helper.selectedSensor.set(nestedObj, changeNestedValue);

		const execQuery = () => {
			if(this.props.onValueChange) {
				this.props.onValueChange(obj.value);
			}
			const paramValue = value && value.length ? value.join("/") : null;
			helper.URLParams.update(this.props.componentId, paramValue, this.props.URLParams);
			helper.selectedSensor.set(obj, isExecuteQuery);
		};

		if (this.props.beforeValueChange) {
			this.props.beforeValueChange(obj.value)
			.then(() => {
				execQuery();
			})
			.catch((e) => {
				console.warn(`${this.props.componentId} - beforeValueChange rejected the promise with`, e);
			});
		} else {
			execQuery();
		}
	}

	// filter
	filterBySearch(value) {
		if (value) {
			const items = this.state.storedItems[0].filter(item => item.key && item.key.toLowerCase().indexOf(value.toLowerCase()) > -1);
			this.setState({
				items: [items]
			});
		} else {
			this.setState({
				items: this.state.storedItems
			});
		}
	}

	onItemClick(selected, level) {
		const { selectedValues, items }  = this.state;
		if (selectedValues[level] && selectedValues[level].includes(selected)) {
			selectedValues[level] = selectedValues[level].filter(item => item !== selected);
		} else {
			const temp = selectedValues[level] || [];
			selectedValues[level] = [...temp, selected];
		}

		if (selectedValues[level] && !selectedValues[level].length) {
			for (let row in selectedValues) {
				if (row >= level) {
					delete selectedValues[row];
				}
			}
		}

		if (selectedValues[level] && selectedValues[level].length > 1) {
			for (let row in selectedValues) {
				if (row > level) {
					delete selectedValues[row];
				}
			}
		}

		delete items[level+1];

		this.setState({
			items,
			selectedValues
		}, () => {
			this.setValue(selectedValues, true, false);
		});
	}

	renderChevron(level) {
		return level < this.props.appbaseField.length-1 ? (<i className="fa fa-chevron-right" />) : "";
	}

	countRender(docCount) {
		let count;
		if (this.props.showCount) {
			count = (<span className="rbc-count"> {docCount}</span>);
		}
		return count;
	}

	renderItems(items, prefix =[]) {
		const level = prefix.length;
		items = items.filter(item => item.key);
		return items.map((item, index) => {
			item.value = prefix.concat([item.key]);
			const active = (Array.isArray(this.state.selectedValues[level]) && this.state.selectedValues[level].includes(item.key));
			const cx = classNames({
				"rbc-item-active": active,
				"rbc-item-inactive": !active
			});
			return (
				<li
					key={index}
					className="rbc-list-container col s12 col-xs-12"
				>
					<div className={`rbc-list-item ${cx}`} onClick={() => this.onItemClick(item.key, level)}>
						<input type="checkbox" className="rbc-checkbox-item" checked={active} onChange={() => {}} />
						<label className="rbc-label">{item.key} {this.countRender(item.doc_count)}</label>
						{this.renderChevron(level)}
					</div>
					{
						active && this.state.selectedValues[level].length === 1 && this.state.items[level+1] ? (
							<ul className="rbc-sublist-container rbc-indent col s12 col-xs-12">
								{this.renderItems(this.state.items[level+1], item.value)}
							</ul>
						) : null
					}
				</li>
			);
		});
	}

	renderList(key, level) {
		let list;
		if (this.state.selectedValues[level].includes(key) && level === 0) {
			list = (
				<ul className="rbc-sublist-container rbc-indent col s12 col-xs-12">
					{this.renderItems(this.state.subItems, 1)}
				</ul>
			);
		}
		return list;
	}

	render() {
		let searchComponent = null,
			title = null;

		if (this.state.storedItems.length === 0 ||
			(this.state.storedItems.length && Array.isArray(this.state.storedItems[0]) && this.state.storedItems[0].length === 0)) {
			return null;
		}

		const listComponent = this.state.items[0] ? (
			<ul className="row rbc-list-container">
				{this.renderItems(this.state.items[0], [])}
			</ul>
		) : null;

		// set static search
		if (this.props.showSearch) {
			searchComponent = (<StaticSearch
				placeholder={this.props.placeholder}
				changeCallback={this.filterBySearch}
			/>);
		}

		if (this.props.title) {
			title = (<h4 className="rbc-title col s12 col-xs-12">{this.props.title}</h4>);
		}

		const cx = classNames({
			"rbc-search-active": this.props.showSearch,
			"rbc-search-inactive": !this.props.showSearch,
			"rbc-title-active": this.props.title,
			"rbc-title-inactive": !this.props.title,
			"rbc-placeholder-active": this.props.placeholder,
			"rbc-placeholder-inactive": !this.props.placeholder,
			"rbc-count-active": this.props.showCount,
			"rbc-count-inactive": !this.props.showCount,
			"rbc-initialloader-active": this.props.initialLoader,
			"rbc-initialloader-inactive": !this.props.initialLoader
		});

		return (
			<div className="rbc rbc-nestedmultilist-container card thumbnail col s12 col-xs-12" style={this.props.componentStyle}>
				<div className={`rbc rbc-nestedmultilist col s12 col-xs-12 ${cx}`}>
					{title}
					{searchComponent}
					{listComponent}
				</div>
				{this.props.initialLoader && this.state.queryStart ? (<InitialLoader defaultText={this.props.initialLoader} />) : null}
			</div>
		);
	}
}

const NestedingValidation = (props, propName) => {
	var err = null;
	if (!props[propName]) {
		err = new Error("appbaseField is required prop!");
	}
	else if (!Array.isArray(props[propName])) {
		err = new Error("appbaseField should be an array!");
	}
	else if (props[propName].length === 0) {
		err = new Error("appbaseField should not have an empty array.");
	}
	else if (props[propName].length > 9) {
		err = new Error("appbaseField can have maximum 10 fields.");
	}
	return err;
}

NestedMultiList.propTypes = {
	componentId: React.PropTypes.string.isRequired,
	appbaseField: NestedingValidation,
	title: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	showCount: React.PropTypes.bool,
	showSearch: React.PropTypes.bool,
	sortBy: React.PropTypes.oneOf(["count", "asc", "desc"]),
	size: helper.sizeValidation,
	defaultSelected: React.PropTypes.array,
	customQuery: React.PropTypes.func,
	placeholder: React.PropTypes.string,
	initialLoader: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	react: React.PropTypes.object,
	beforeValueChange: React.PropTypes.func,
	onValueChange: React.PropTypes.func,
	componentStyle: React.PropTypes.object,
	URLParams: React.PropTypes.bool,
	showFilter: React.PropTypes.bool,
	filterLabel: React.PropTypes.string
};

// Default props value
NestedMultiList.defaultProps = {
	showCount: true,
	sortBy: "count",
	size: 100,
	showSearch: true,
	title: null,
	placeholder: "Search",
	componentStyle: {},
	URLParams: false,
	showFilter: true
};

// context type
NestedMultiList.contextTypes = {
	appbaseRef: React.PropTypes.any.isRequired,
	type: React.PropTypes.any.isRequired,
	reactiveId: React.PropTypes.number
};

NestedMultiList.types = {
	componentId: TYPES.STRING,
	appbaseField: TYPES.ARRAY,
	appbaseFieldType: TYPES.STRING,
	title: TYPES.STRING,
	placeholder: TYPES.STRING,
	react: TYPES.OBJECT,
	size: TYPES.NUMBER,
	sortBy: TYPES.STRING,
	showCount: TYPES.BOOLEAN,
	showSearch: TYPES.BOOLEAN,
	defaultSelected: TYPES.ARRAY,
	customQuery: TYPES.FUNCTION,
	initialLoader: TYPES.OBJECT,
	URLParams: TYPES.BOOLEAN,
	showFilter: TYPES.BOOLEAN,
	filterLabel: TYPES.STRING
};