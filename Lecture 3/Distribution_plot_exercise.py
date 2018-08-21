#######
# Objective: Using the iris dataset, develop a Distplot
# that compares the petal lengths of each class.
# File: '../data/iris.csv'
# Fields: 'sepal_length','sepal_width','petal_length','petal_width','class'
# Classes: 'Iris-setosa','Iris-versicolor','Iris-virginica'
######

# Perform imports here:
import pandas as pd
import plotly.figure_factory as ff
import plotly.offline as pyo
# create a DataFrame from the .csv file:
df = pd.read_csv('iris.csv')
# Define the traces
trace0 = df[df['class']=='Iris-setosa']['petal_length']
trace1 = df[df['class']=='Iris-versicolor']['petal_length']
trace2 = df[df['class']=='Iris-virginica']['petal_length']

# Define a data variable
hist_data=[trace0, trace1, trace2]
group_labels = ['Iris-setosa', 'Iris-versicolor', 'Iris-virginica']
# Create a fig from data and layout, and plot the fig

fig = ff.create_distplot(hist_data=hist_data, group_labels=group_labels)
pyo.plot(fig)
