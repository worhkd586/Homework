#######
# Objective: Create a bubble chart that compares three other features
# from the mpg.csv dataset. Fields include: 'mpg', 'cylinders', 'displacement'
# 'horsepower', 'weight', 'acceleration', 'model_year', 'origin', 'name'
######

# Perform imports here:
import pandas as pd
import plotly.offline as pyo
import plotly.graph_objs as go
# create a DataFrame from the .csv file:
df = pd.read_csv('mpg.csv')

# create data by choosing fields for x, y and marker size attributes
data = [go.Scatter(x=df['model_year'],
                    y=df['horsepower'],
                    text=df['name'],
                    mode='markers',
                    marker=dict(size=df['mpg']/3))]
# create a layout with a title and axis labels
layout = go.Layout(title='BubbleChart_Solution',
                    xaxis=dict(title='model_year'),
                    yaxis=dict(title='horsepower'))
# create a fig from data & layout, and plot the fig
fig = go.Figure(data=data, layout=layout)
pyo.plot(fig)
