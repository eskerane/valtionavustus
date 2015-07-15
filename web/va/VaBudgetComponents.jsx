import React from 'react'
import _ from 'lodash'
import ClassNames from 'classnames'

import ComponentFactory from '../form/ComponentFactory.js'
import Translator from '../form/Translator.js'
import LocalizedString from '../form/component/LocalizedString.jsx'
import {FieldUpdateHandler} from '../form/FieldUpdateHandler.js'
import InputValueStorage from '../form/InputValueStorage.js'
import FormUtil from '../form/FormUtil.js'
import JsUtil from '../form/JsUtil.js'

export class VaBudgetElement extends React.Component {
  constructor(props) {
    super(props)
    this.miscTranslator = new Translator(this.props.translations["misc"])
  }

  render() {
    const children = this.props.children
    const htmlId = this.props.htmlId

    const summingElementChildren = _.filter(this.props.children, child => { return child.props.field.displayAs === "vaSummingBudgetElement" })
    const subTotalsAndErrors = _.map(summingElementChildren, this.populateSummingElementSum(this.props.answersObject))
    const total = _.reduce(subTotalsAndErrors, (acc, errorFlagAndSum) => { return acc + errorFlagAndSum.sum }, 0)
    const someFigureHasError = _.some(subTotalsAndErrors, (errorFlagAndSum) => { return errorFlagAndSum.containsErrors })
    const summaryElement = _.last(children)
    summaryElement.props.totalNeeded = someFigureHasError ? this.miscTranslator.translate("check-numbers", this.props.lang, "VIRHE") : total
    return (this.html(htmlId, children))
  }

  html(htmlId, children) {
    return (<fieldset className="va-budget" id={htmlId}>
              {children}
            </fieldset>)
  }

  populateSummingElementSum(answersObject) {
    return function(summingBudgetElement) {
      const amountValues = _.map(summingBudgetElement.props.children, itemElement => {
        const amountCoefficient = itemElement.props.field.params.incrementsTotal ? 1 : -1
        const amountElement = itemElement.props.children[1]
        const errorsOfElement = amountElement.props.validationErrors
        const value = _.isEmpty(errorsOfElement) ?
          InputValueStorage.readValue(null, answersObject, amountElement.props.field.id) :
          0
        return { "containsErrors": !_.isEmpty(errorsOfElement), "value": amountCoefficient * value }
      })
      const sum = _.reduce(amountValues, (total, errorsAndValue) => { return total + errorsAndValue.value }, 0)
      const containsErrors = _.some(amountValues, (errorsAndValue) => { return errorsAndValue.containsErrors })
      summingBudgetElement.props.sum = sum
      return { "containsErrors": containsErrors, "sum": sum}
    }
  }
}

export class SummingBudgetElement extends React.Component {
  render() {
    const field = this.props.field
    const children = this.props.children
    const sum = this.props.sum

    const htmlId = this.props.htmlId
    const columnTitles = field.params.showColumnTitles ? <thead><tr>
      <th><LocalizedString translations={field.params.columnTitles} translationKey="label" lang={this.props.lang} /></th>
      <th><LocalizedString translations={field.params.columnTitles} translationKey="description" lang={this.props.lang} /></th>
      <th className="money-column"><LocalizedString className="money required" translations={field.params.columnTitles} translationKey="amount" lang={this.props.lang} /></th>
    </tr></thead> : undefined
    const classNames = ClassNames({"required": field.required })
    return (
      <table id={htmlId} className="summing-table">
        <caption className={!_.isEmpty(classNames) ? classNames : undefined}><LocalizedString translations={field} translationKey="label" lang={this.props.lang} /></caption>
        <colgroup>
          <col className="label-column" />
          <col className="description-column" />
          <col className="amount-column" />
        </colgroup>
        {columnTitles}
        <tbody>
        {children}
        </tbody>
        <tfoot><tr>
          <td colSpan="2"><LocalizedString translations={field.params} translationKey="sumRowLabel" lang={this.props.lang} /></td>
          <td className="money-column"><span className="money sum">{sum}</span></td>
        </tr></tfoot>
      </table>
    )
  }
}

export class BudgetItemElement extends React.Component {
  render() {
    const field = this.props.field
    const children = this.props.children
    const htmlId = this.props.htmlId
    const descriptionComponent = children[0]
    const amountComponent = children[1]
    return (
      <tr id={htmlId} className="budget-item">
        <td><LocalizedString translations={field} translationKey="label" lang={this.props.lang} /></td>
        <td>{descriptionComponent}</td>
        <td className="money-column">{amountComponent}</td>
      </tr>
    )
  }

  static handleBudgetAmountUpdate(state, amountFieldId, newFieldValue) {
    const budgetItemParentArray = JsUtil.flatFilter(state.form.content, p => {
      return p.displayAs === "vaBudgetItemElement" && _.some(p.children, child => {
          return child.id === amountFieldId
        })
    })
    if (!_.isEmpty(budgetItemParentArray)) {
      const descriptionField = budgetItemParentArray[0].children[0]
      descriptionField.required = parseInt(newFieldValue) > 0
      FieldUpdateHandler.triggerFieldUpdatesForValidation([descriptionField], state)
    }
  }
}

export class BudgetSummaryElement extends React.Component {
  render() {
    const htmlId = this.props.htmlId
    const field = this.props.field

    const vaSpecificProperties = this.props.customProps
    const avustushaku = vaSpecificProperties.avustushaku
    const selfFinancingPercentage = avustushaku.content["self-financing-percentage"]

    const totalNeeded = this.props.totalNeeded
    const figuresAreValid = FormUtil.isNumeric(totalNeeded) && totalNeeded > 0
    const selfFinancingShare = figuresAreValid ? Math.ceil((selfFinancingPercentage / 100) * totalNeeded) : totalNeeded
    const ophShare = figuresAreValid ? (totalNeeded - selfFinancingShare) : totalNeeded
    const sumClassNames = ClassNames("money sum", figuresAreValid ? undefined : "error")
    return (
      <table id={htmlId} className="budget-summary">
        <colgroup>
          <col className="label-column" />
          <col className="amount-column" />
        </colgroup>
        <tbody>
        <tr className="grand-total">
          <td><LocalizedString translations={field.params} translationKey="totalSumRowLabel" lang={this.props.lang} /></td>
          <td className="money-column"><span className={sumClassNames}>{totalNeeded}</span></td>
        </tr>
        <tr>
          <td><LocalizedString translations={field.params} translationKey="ophFinancingLabel" lang={this.props.lang} /> {100 - selfFinancingPercentage} %</td>
          <td className="money-column"><span className={sumClassNames}>{ophShare}</span></td>
        </tr>
        <tr>
          <td><LocalizedString translations={field.params} translationKey="selfFinancingLabel" lang={this.props.lang} /> {selfFinancingPercentage} %</td>
          <td className="money-column"><span className={sumClassNames}>{selfFinancingShare}</span></td>
        </tr>
        </tbody>
      </table>
    )
  }
}